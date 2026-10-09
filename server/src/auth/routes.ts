import {
  changePasswordSchema,
  loginSchema,
  requestResetSchema,
  resetPasswordSchema,
  signupSchema,
  verifyEmailSchema,
} from '@pipeline/shared';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { Hono, type Context } from 'hono';
import { v7 as uuidv7 } from 'uuid';
import { newToken, normalizeEmail, sessionIdForToken, sha256 } from '../crypto.js';
import {
  ABSOLUTE_MS,
  AUTH_EVENT,
  RESET_TTL_MS,
  VERIFY_TTL_MS,
  authEvents,
  authTokens,
  sessions,
  users,
} from '../db/schema.js';
import type { AppDeps, AppEnv } from '../deps.js';
import {
  CSRF_COOKIE,
  clientIp,
  clearSessionCookie,
  csrfCookie,
  invalidInput,
  readCookie,
  readJson,
  sessionCookie,
  userAgent,
} from '../http.js';
import { existingAccountEmail, lockoutEmail, resetEmail, verifyEmail } from '../mail/transport.js';
import { MSG } from '../messages.js';
import { replacePassword } from './credentials.js';
import { dummyPasswordHash, hashPassword, verifyPassword } from './password.js';
import {
  RATE,
  clearLoginFailures,
  consumeRateLimit,
  loginLock,
  recordLoginFailure,
} from './rate-limit.js';
import { findUserByEmail, findUserById, presentUser } from './users.js';

async function audit(
  deps: AppDeps,
  input: { userId: string | null; kind: string; ip: string; userAgent: string | null; now: Date },
) {
  await deps.db.insert(authEvents).values({
    id: uuidv7(),
    userId: input.userId,
    kind: input.kind,
    ip: input.ip,
    userAgent: input.userAgent,
    createdAt: input.now,
  });
}

async function sendQuietly(deps: AppDeps, message: { to: string; subject: string; text: string }) {
  try {
    await deps.mail.send(message);
  } catch (err) {
    console.error(err instanceof Error ? err.message : 'email send failed');
  }
}

async function issueToken(
  deps: AppDeps,
  userId: string,
  kind: 'verify_email' | 'reset_password',
  now: Date,
  ttlMs: number,
) {
  const token = newToken(32);
  await deps.db.insert(authTokens).values({
    id: uuidv7(),
    userId,
    kind,
    tokenHash: sha256(token),
    expiresAt: new Date(now.getTime() + ttlMs),
    usedAt: null,
  });
  return token;
}

async function notifyLockout(
  deps: AppDeps,
  user: { id: string; email: string; timeZone: string },
  lockedUntil: Date,
  ip: string,
  agent: string | null,
  now: Date,
) {
  await deps.db
    .update(authTokens)
    .set({ usedAt: now })
    .where(
      and(
        eq(authTokens.userId, user.id),
        eq(authTokens.kind, 'reset_password'),
        isNull(authTokens.usedAt),
      ),
    );
  const token = await issueToken(deps, user.id, 'reset_password', now, RESET_TTL_MS);
  const mail = lockoutEmail({
    appUrl: deps.env.APP_URL,
    token,
    unlockAt: lockedUntil,
    timeZone: user.timeZone,
    ip,
    userAgent: agent,
  });
  await sendQuietly(deps, { to: user.email, ...mail });
}

async function openSession(
  deps: AppDeps,
  userId: string,
  ip: string,
  agent: string | null,
  now: Date,
) {
  const token = newToken(32);
  const id = sessionIdForToken(token, deps.env.SESSION_SECRET);
  await deps.db.insert(sessions).values({
    id,
    userId,
    createdAt: now,
    lastSeenAt: now,
    expiresAt: new Date(now.getTime() + ABSOLUTE_MS),
    ip,
    userAgent: agent,
    mfaPassed: false,
  });
  return token;
}

export function authRoutes(deps: AppDeps) {
  const routes = new Hono<AppEnv>();

  routes.get('/csrf', (c) => {
    let token = readCookie(c.req.header('cookie'), CSRF_COOKIE);
    if (!token) {
      token = newToken(32);
      c.header('Set-Cookie', csrfCookie(token), { append: true });
    }
    return c.json({ csrfToken: token });
  });

  routes.post('/signup', async (c) => {
    const parsed = signupSchema.safeParse(await readJson(c));
    if (!parsed.success) return c.json(invalidInput(parsed.error), 400);

    const now = deps.clock.now();
    const ip = clientIp(c, deps.env.TRUSTED_PROXY_HOPS);
    const allowed = await consumeRateLimit(
      deps.db,
      `signup-ip:${ip}`,
      RATE.signupIp.max,
      RATE.signupIp.windowMs,
      now,
    );
    if (!allowed) return c.json({ error: MSG.rateLimited }, 429);

    const email = normalizeEmail(parsed.data.email);
    const breach = await deps.hibp(parsed.data.password);
    if (breach === true) return c.json({ error: MSG.pwned }, 422);

    const passwordHash = await hashPassword(parsed.data.password);
    const existing = await findUserByEmail(deps.db, email);
    if (existing) {
      if (!existing.emailVerifiedAt) {
        const token = await issueToken(deps, existing.id, 'verify_email', now, VERIFY_TTL_MS);
        const mail = verifyEmail(deps.env.APP_URL, token);
        await sendQuietly(deps, { to: existing.email, ...mail });
      } else {
        const mail = existingAccountEmail(deps.env.APP_URL);
        await sendQuietly(deps, { to: existing.email, ...mail });
      }
      return c.json({ message: MSG.signup });
    }

    const userId = uuidv7();
    await deps.db.insert(users).values({
      id: userId,
      email,
      passwordHash,
      emailVerifiedAt: null,
      timeZone: parsed.data.timeZone ?? 'America/Denver',
      isDemo: false,
      demoExpiresAt: null,
      createdAt: now,
    });
    const token = await issueToken(deps, userId, 'verify_email', now, VERIFY_TTL_MS);
    const mail = verifyEmail(deps.env.APP_URL, token);
    await sendQuietly(deps, { to: email, ...mail });
    return c.json({ message: MSG.signup });
  });

  routes.post('/login', async (c) => {
    const parsed = loginSchema.safeParse(await readJson(c));
    if (!parsed.success) return c.json(invalidInput(parsed.error), 400);

    const now = deps.clock.now();
    const ip = clientIp(c, deps.env.TRUSTED_PROXY_HOPS);
    const agent = userAgent(c);
    const email = normalizeEmail(parsed.data.email);
    const emailHash = sha256(email);

    const ipAllowed = await consumeRateLimit(
      deps.db,
      `login-ip:${ip}`,
      RATE.loginIp.max,
      RATE.loginIp.windowMs,
      now,
    );
    const accountIpAllowed = await consumeRateLimit(
      deps.db,
      `login-acct-ip:${emailHash}:${ip}`,
      RATE.loginAccountIp.max,
      RATE.loginAccountIp.windowMs,
      now,
    );
    if (!ipAllowed || !accountIpAllowed) return c.json({ error: MSG.rateLimited }, 429);

    const user = await findUserByEmail(deps.db, email);
    const lock = user ? await loginLock(deps.db, user.id) : { count: 0, lockedUntil: null };
    const locked = lock.lockedUntil != null && lock.lockedUntil.getTime() > now.getTime();
    const passwordHash = user?.passwordHash ?? (await dummyPasswordHash());
    const passwordOk = await verifyPassword(passwordHash, parsed.data.password);
    const accountAllowed = await consumeRateLimit(
      deps.db,
      `login-acct:${emailHash}`,
      RATE.loginAccount.max,
      RATE.loginAccount.windowMs,
      now,
    );
    if (!accountAllowed || !user || !passwordOk || locked) {
      if (accountAllowed && user && !locked && !passwordOk) {
        const failure = await recordLoginFailure(deps.db, user.id, now);
        if (failure.lockedUntil)
          await notifyLockout(deps, user, failure.lockedUntil, ip, agent, now);
      }
      await audit(deps, {
        userId: user?.id ?? null,
        kind: AUTH_EVENT.signInFailure,
        ip,
        userAgent: agent,
        now,
      });
      return c.json({ error: MSG.badLogin }, 401);
    }

    await clearLoginFailures(deps.db, user.id);
    const token = await openSession(deps, user.id, ip, agent, now);
    await audit(deps, { userId: user.id, kind: AUTH_EVENT.signIn, ip, userAgent: agent, now });
    c.header('Set-Cookie', sessionCookie(token), { append: true });
    return c.json({ user: presentUser(user) });
  });

  routes.post('/logout', async (c) => {
    const user = c.get('user');
    const sessionId = c.get('sessionId');
    if (!user || !sessionId) return c.json({ error: MSG.unauthorized }, 401);
    const now = deps.clock.now();
    await deps.db.delete(sessions).where(eq(sessions.id, sessionId));
    await audit(deps, {
      userId: user.id,
      kind: AUTH_EVENT.signOut,
      ip: clientIp(c, deps.env.TRUSTED_PROXY_HOPS),
      userAgent: userAgent(c),
      now,
    });
    c.header('Set-Cookie', clearSessionCookie(), { append: true });
    return c.json({ ok: true });
  });

  routes.post('/logout-all', async (c) => {
    const user = c.get('user');
    if (!user) return c.json({ error: MSG.unauthorized }, 401);
    const now = deps.clock.now();
    await deps.db.delete(sessions).where(eq(sessions.userId, user.id));
    await audit(deps, {
      userId: user.id,
      kind: AUTH_EVENT.signOutAll,
      ip: clientIp(c, deps.env.TRUSTED_PROXY_HOPS),
      userAgent: userAgent(c),
      now,
    });
    c.header('Set-Cookie', clearSessionCookie(), { append: true });
    return c.json({ ok: true });
  });

  routes.post('/verify-email', async (c) => {
    const parsed = verifyEmailSchema.safeParse(await readJson(c));
    if (!parsed.success) return c.json(invalidInput(parsed.error), 400);
    const now = deps.clock.now();
    const tokenRow = await takeToken(deps, parsed.data.token, 'verify_email', now);
    if (!tokenRow) return c.json({ error: MSG.invalidToken }, 400);
    const user = await findUserById(deps.db, tokenRow.userId);
    if (!user) return c.json({ error: MSG.invalidToken }, 400);
    if (!user.emailVerifiedAt) {
      await deps.db.update(users).set({ emailVerifiedAt: now }).where(eq(users.id, user.id));
      await audit(deps, {
        userId: user.id,
        kind: AUTH_EVENT.emailVerified,
        ip: clientIp(c, deps.env.TRUSTED_PROXY_HOPS),
        userAgent: userAgent(c),
        now,
      });
    }
    return c.json({ ok: true });
  });

  routes.post('/request-reset', async (c) => {
    const parsed = requestResetSchema.safeParse(await readJson(c));
    if (!parsed.success) return c.json(invalidInput(parsed.error), 400);
    const now = deps.clock.now();
    const ip = clientIp(c, deps.env.TRUSTED_PROXY_HOPS);
    const email = normalizeEmail(parsed.data.email);
    const ipAllowed = await consumeRateLimit(
      deps.db,
      `reset-ip:${ip}`,
      RATE.resetIp.max,
      RATE.resetIp.windowMs,
      now,
    );
    if (!ipAllowed) return c.json({ error: MSG.rateLimited }, 429);
    const accountAllowed = await consumeRateLimit(
      deps.db,
      `reset-acct:${sha256(email)}`,
      RATE.resetAccount.max,
      RATE.resetAccount.windowMs,
      now,
    );
    if (!accountAllowed) return c.json({ message: MSG.signup });

    const user = await findUserByEmail(deps.db, email);
    if (user && !user.isDemo && user.passwordHash) {
      await deps.db
        .update(authTokens)
        .set({ usedAt: now })
        .where(
          and(
            eq(authTokens.userId, user.id),
            eq(authTokens.kind, 'reset_password'),
            isNull(authTokens.usedAt),
          ),
        );
      const token = await issueToken(deps, user.id, 'reset_password', now, RESET_TTL_MS);
      const mail = resetEmail(deps.env.APP_URL, token);
      await sendQuietly(deps, { to: user.email, ...mail });
    }
    return c.json({ message: MSG.signup });
  });

  routes.get('/reset-password', (c) => checkResetToken(deps, c));

  routes.post('/reset-password', async (c) => {
    const parsed = resetPasswordSchema.safeParse(await readJson(c));
    if (!parsed.success) return c.json(invalidInput(parsed.error), 400);
    const breach = await deps.hibp(parsed.data.password);
    if (breach === true) return c.json({ error: MSG.pwned }, 422);

    const now = deps.clock.now();
    const tokenRow = await findLiveToken(deps, parsed.data.token, 'reset_password', now);
    if (!tokenRow) return c.json({ error: MSG.invalidToken }, 400);
    const user = await findUserById(deps.db, tokenRow.userId);
    if (!user) return c.json({ error: MSG.invalidToken }, 400);
    if (user.isDemo) return c.json({ error: MSG.demoPassword }, 403);

    const passwordHash = await hashPassword(parsed.data.password);
    const replaced = await replacePassword(deps.db, {
      userId: user.id,
      passwordHash,
      now,
      requiredTokenId: tokenRow.id,
    });
    if (!replaced) return c.json({ error: MSG.invalidToken }, 400);
    await audit(deps, {
      userId: user.id,
      kind: AUTH_EVENT.passwordReset,
      ip: clientIp(c, deps.env.TRUSTED_PROXY_HOPS),
      userAgent: userAgent(c),
      now,
    });
    return c.json({ ok: true });
  });

  routes.post('/change-password', (c) => changePassword(deps, c));

  routes.get('/me', (c) => {
    const user = c.get('user');
    if (!user) return c.json({ error: MSG.unauthorized }, 401);
    return c.json({ user: presentUser(user) });
  });

  routes.get('/sessions', async (c) => {
    const user = c.get('user');
    const current = c.get('sessionId');
    if (!user) return c.json({ error: MSG.unauthorized }, 401);
    const rows = await deps.db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, user.id))
      .orderBy(desc(sessions.createdAt));
    return c.json({
      sessions: rows.map((row) => ({
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        lastSeenAt: row.lastSeenAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
        ip: row.ip,
        userAgent: row.userAgent,
        current: row.id === current,
      })),
    });
  });

  routes.delete('/sessions/:id', async (c) => {
    const user = c.get('user');
    if (!user) return c.json({ error: MSG.unauthorized }, 401);
    const id = c.req.param('id');
    const removed = await deps.db
      .delete(sessions)
      .where(and(eq(sessions.id, id), eq(sessions.userId, user.id)))
      .returning({ id: sessions.id });
    if (removed.length === 0) return c.json({ error: MSG.notFound }, 404);
    if (id === c.get('sessionId')) c.header('Set-Cookie', clearSessionCookie(), { append: true });
    return c.json({ ok: true });
  });

  routes.get('/events', async (c) => {
    const user = c.get('user');
    if (!user) return c.json({ error: MSG.unauthorized }, 401);
    const rows = await deps.db
      .select()
      .from(authEvents)
      .where(eq(authEvents.userId, user.id))
      .orderBy(desc(authEvents.createdAt))
      .limit(50);
    return c.json({
      events: rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        ip: row.ip,
        userAgent: row.userAgent,
        createdAt: row.createdAt.toISOString(),
      })),
    });
  });

  return routes;
}

export function meRoutes(deps: AppDeps) {
  const routes = new Hono<AppEnv>();
  routes.post('/me/password', (c) => changePassword(deps, c));
  return routes;
}

async function checkResetToken(deps: AppDeps, c: Context<AppEnv>) {
  const now = deps.clock.now();
  const ip = clientIp(c, deps.env.TRUSTED_PROXY_HOPS);
  const token = c.req.query('token') ?? '';
  const prefix = sha256(token).slice(0, 16);
  const ipAllowed = await consumeRateLimit(
    deps.db,
    `reset-check-ip:${ip}`,
    RATE.resetCheckIp.max,
    RATE.resetCheckIp.windowMs,
    now,
  );
  const prefixAllowed = await consumeRateLimit(
    deps.db,
    `reset-check-prefix:${prefix}`,
    RATE.resetCheckPrefix.max,
    RATE.resetCheckPrefix.windowMs,
    now,
  );
  const globalAllowed = await consumeRateLimit(
    deps.db,
    'reset-check-global',
    RATE.resetCheckGlobal.max,
    RATE.resetCheckGlobal.windowMs,
    now,
  );
  if (!ipAllowed || !prefixAllowed || !globalAllowed) {
    return c.json({ error: MSG.rateLimited }, 429);
  }
  if (!token) return c.json({ error: MSG.invalidToken }, 400);
  const tokenRow = await findLiveToken(deps, token, 'reset_password', now);
  if (!tokenRow) return c.json({ error: MSG.invalidToken }, 400);
  return c.json({ ok: true });
}

async function changePassword(deps: AppDeps, c: Context<AppEnv>) {
  const user = c.get('user');
  if (!user) return c.json({ error: MSG.unauthorized }, 401);
  if (user.isDemo) return c.json({ error: MSG.demoPassword }, 403);
  const parsed = changePasswordSchema.safeParse(await readJson(c));
  if (!parsed.success) return c.json(invalidInput(parsed.error), 400);
  const breach = await deps.hibp(parsed.data.newPassword);
  if (breach === true) return c.json({ error: MSG.pwned }, 422);

  const currentHash = user.passwordHash ?? (await dummyPasswordHash());
  const matches = await verifyPassword(currentHash, parsed.data.currentPassword);
  if (!user.passwordHash || !matches) return c.json({ error: MSG.currentPassword }, 401);

  const now = deps.clock.now();
  const passwordHash = await hashPassword(parsed.data.newPassword);
  await replacePassword(deps.db, { userId: user.id, passwordHash, now });
  const token = await openSession(
    deps,
    user.id,
    clientIp(c, deps.env.TRUSTED_PROXY_HOPS),
    userAgent(c),
    now,
  );
  await audit(deps, {
    userId: user.id,
    kind: AUTH_EVENT.passwordChange,
    ip: clientIp(c, deps.env.TRUSTED_PROXY_HOPS),
    userAgent: userAgent(c),
    now,
  });
  c.header('Set-Cookie', sessionCookie(token), { append: true });
  return c.json({ ok: true });
}

async function findLiveToken(
  deps: AppDeps,
  token: string,
  kind: 'verify_email' | 'reset_password',
  now: Date,
) {
  const rows = await deps.db
    .select()
    .from(authTokens)
    .where(and(eq(authTokens.tokenHash, sha256(token)), eq(authTokens.kind, kind)));
  const row = rows[0];
  if (!row || row.usedAt || row.expiresAt.getTime() <= now.getTime()) return null;
  return row;
}

async function takeToken(
  deps: AppDeps,
  token: string,
  kind: 'verify_email' | 'reset_password',
  now: Date,
) {
  const live = await findLiveToken(deps, token, kind, now);
  if (!live) return null;
  const consumed = await consumeToken(deps, live.id, now);
  return consumed ? live : null;
}

async function consumeToken(deps: AppDeps, id: string, now: Date): Promise<boolean> {
  const updated = await deps.db
    .update(authTokens)
    .set({ usedAt: now })
    .where(and(eq(authTokens.id, id), isNull(authTokens.usedAt)))
    .returning({ id: authTokens.id });
  return updated.length > 0;
}
