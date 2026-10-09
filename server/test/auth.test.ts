import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { consumeRateLimit, lockoutSeconds } from '../src/auth/rate-limit.js';
import { authTokens, rateLimits, sessions, users } from '../src/db/schema.js';
import { sha256 } from '../src/crypto.js';
import { deleteExpiredDemoUsers } from '../src/demo.js';
import { resolveMailTransport } from '../src/env.js';
import { formatUnlockTime } from '../src/mail/transport.js';
import type { HibpResult } from '../src/auth/hibp.js';
import { MSG } from '../src/messages.js';
import {
  api,
  boot,
  CookieJar,
  login,
  tokenFrom,
  truncate,
  withCsrf,
  type TestApp,
} from './helpers.js';
import type { Database } from '../src/db/client.js';
import type { MemoryMailTransport } from '../src/mail/transport.js';
import type { createClock } from '../src/clock.js';

const password = 'horse-battery-staple-99';
const email = 'ada@example.test';

describe('mail transport selection', () => {
  it('uses memory in test, console in dev, and Resend when a key or production is set', () => {
    expect(resolveMailTransport('test', undefined, undefined)).toBe('memory');
    expect(resolveMailTransport('development', undefined, undefined)).toBe('console');
    expect(resolveMailTransport('development', 're_test', undefined)).toBe('resend');
    expect(resolveMailTransport('production', 're_test', undefined)).toBe('resend');
    expect(() => resolveMailTransport('production', undefined, undefined)).toThrow(
      /RESEND_API_KEY/,
    );
    expect(() => resolveMailTransport('production', undefined, 'console')).toThrow(/Resend/);
  });
});

describe('lockout duration', () => {
  it('starts at one minute after 5 failures and doubles to a one-hour cap', () => {
    expect(lockoutSeconds(4)).toBeNull();
    expect(lockoutSeconds(5)).toBe(60);
    expect(lockoutSeconds(6)).toBe(120);
    expect(lockoutSeconds(11)).toBe(3600);
    expect(lockoutSeconds(20)).toBe(3600);
  });
});

describe('auth', () => {
  let db: Database;
  let app: TestApp;
  let mail: MemoryMailTransport;
  let clock: ReturnType<typeof createClock>;
  let close: () => Promise<void>;
  const hibpState: { result: HibpResult } = { result: false };

  beforeAll(async () => {
    const ctx = await boot(async () => hibpState.result);
    db = ctx.db;
    app = ctx.app;
    mail = ctx.mail;
    clock = ctx.clock;
    close = () => ctx.sql.end({ timeout: 5 });
  });

  afterAll(async () => {
    await close();
  });

  beforeEach(async () => {
    hibpState.result = false;
    mail.clear();
    clock.set(new Date('2026-10-09T18:00:00.000Z'));
    await truncate(db);
  });

  it('sets security headers and a host-only session cookie', async () => {
    const jar = new CookieJar();
    const health = await api(app, jar, '/api/health');
    expect(health.status).toBe(200);
    const csp = health.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain('unsafe-inline');
    expect(health.headers.get('strict-transport-security')).toContain('max-age=31536000');
    expect(health.headers.get('x-content-type-options')).toBe('nosniff');
    expect(health.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    expect(health.headers.get('permissions-policy')).toContain('camera=()');
    expect(health.headers.get('permissions-policy')).toContain('microphone=()');
    expect(health.headers.get('permissions-policy')).toContain('geolocation=()');
    expect(health.headers.get('cross-origin-opener-policy')).toBe('same-origin');
    expect(health.headers.get('cross-origin-resource-policy')).toBe('same-origin');
    expect(health.headers.get('cache-control')).not.toBe('no-store');

    const csrf = await api(app, jar, '/api/auth/csrf');
    expect(csrf.headers.get('cache-control')).toBe('no-store');
    const anon = await api(app, new CookieJar(), '/api/auth/me');
    expect(anon.status).toBe(401);
    expect(anon.headers.get('cache-control')).toBe('no-store');

    await signup(jar, email);
    const token = tokenFrom(mail, 'Verify');
    await api(app, jar, '/api/auth/verify-email', { method: 'POST', body: { token } });
    const loggedIn = await login(app, jar, email, password);
    expect(loggedIn.status).toBe(200);
    const setCookie = loggedIn.headers
      .getSetCookie()
      .find((cookie) => cookie.startsWith('__Host-sid='));
    expect(setCookie).toBeDefined();
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('Secure');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain('Path=/');
    expect(setCookie?.toLowerCase()).not.toContain('domain=');

    const me = await api(app, jar, '/api/auth/me');
    expect(me.headers.get('cache-control')).toBe('no-store');
    const listed = await api(app, jar, '/api/applications');
    expect(listed.headers.get('cache-control')).not.toBe('no-store');

    await withCsrf(app, jar);
    const changed = await api(app, jar, '/api/me/password', {
      method: 'POST',
      body: { currentPassword: 'not-the-password', newPassword: 'horse-battery-staple-77' },
    });
    expect(changed.status).toBe(401);
    expect(changed.headers.get('cache-control')).toBe('no-store');
  });

  it('does not enumerate accounts on signup, login, or reset', async () => {
    const first = new CookieJar();
    const created = await signup(first, email);
    const again = await signup(first, 'Ada@Example.test');
    expect(created.status).toBe(200);
    expect(again.status).toBe(200);
    expect(await created.clone().json()).toEqual(await again.json());

    const unknown = await login(app, new CookieJar(), 'missing@example.test', password);
    const wrong = await login(app, new CookieJar(), email, 'not-the-right-password');
    expect(unknown.status).toBe(wrong.status);
    expect(await unknown.json()).toEqual(await wrong.json());
    expect(unknown.status).toBe(401);

    const missingJar = new CookieJar();
    await withCsrf(app, missingJar);
    const missingReset = await api(app, missingJar, '/api/auth/request-reset', {
      method: 'POST',
      body: { email: 'nobody@example.test' },
    });
    const knownJar = new CookieJar();
    await withCsrf(app, knownJar);
    const knownReset = await api(app, knownJar, '/api/auth/request-reset', {
      method: 'POST',
      body: { email },
    });
    expect(missingReset.status).toBe(200);
    expect(knownReset.status).toBe(200);
    expect(await missingReset.json()).toEqual(await knownReset.json());
  });

  it('requires CSRF and a matching origin', async () => {
    const jar = new CookieJar();
    const missing = await api(app, jar, '/api/auth/login', {
      method: 'POST',
      body: { email, password },
      csrf: false,
    });
    expect(missing.status).toBe(403);

    await withCsrf(app, jar);
    const badOrigin = await api(app, jar, '/api/auth/login', {
      method: 'POST',
      body: { email, password },
      origin: 'https://evil.example',
    });
    expect(badOrigin.status).toBe(403);
  });

  it('lets an unverified user sign in but not create an application', async () => {
    const jar = new CookieJar();
    await signup(jar, email);
    const loggedIn = await login(app, jar, 'ADA@example.test', password);
    expect(loggedIn.status).toBe(200);
    const blocked = await api(app, jar, '/api/applications', {
      method: 'POST',
      body: { company: 'Hooli', role: 'Backend Engineer', applied_on: '2026-10-01' },
    });
    expect(blocked.status).toBe(403);

    const token = tokenFrom(mail, 'Verify');
    const verified = await api(app, jar, '/api/auth/verify-email', {
      method: 'POST',
      body: { token },
    });
    expect(verified.status).toBe(200);
    const created = await api(app, jar, '/api/applications', {
      method: 'POST',
      body: { company: 'Hooli', role: 'Backend Engineer', applied_on: '2026-10-01' },
    });
    expect(created.status).toBe(201);

    const events = await api(app, jar, '/api/auth/events');
    const body = (await events.json()) as { events: Array<{ kind: string }> };
    expect(body.events.map((event) => event.kind)).toContain('email_verified');
    expect(body.events.map((event) => event.kind)).toContain('sign_in');
  });

  it('resets a password once, revokes every session, and records the audit event', async () => {
    const jar = new CookieJar();
    await signup(jar, email);
    const verify = tokenFrom(mail, 'Verify');
    await api(app, jar, '/api/auth/verify-email', { method: 'POST', body: { token: verify } });
    const first = new CookieJar();
    const second = new CookieJar();
    expect((await login(app, first, email, password)).status).toBe(200);
    expect((await login(app, second, email, password)).status).toBe(200);

    await withCsrf(app, jar);
    const requested = await api(app, jar, '/api/auth/request-reset', {
      method: 'POST',
      body: { email },
    });
    expect(requested.status).toBe(200);
    const resetToken = tokenFrom(mail, 'Reset');
    const nextPassword = 'horse-battery-staple-21';
    const resetJar = new CookieJar();
    await withCsrf(app, resetJar);
    const reset = await api(app, resetJar, '/api/auth/reset-password', {
      method: 'POST',
      body: { token: resetToken, password: nextPassword },
    });
    expect(reset.status).toBe(200);
    expect(reset.headers.getSetCookie().some((cookie) => cookie.startsWith('__Host-sid='))).toBe(
      false,
    );
    const reused = await api(app, resetJar, '/api/auth/reset-password', {
      method: 'POST',
      body: { token: resetToken, password: 'horse-battery-staple-22' },
    });
    expect(reused.status).toBe(400);

    expect((await api(app, first, '/api/auth/me')).status).toBe(401);
    expect((await api(app, second, '/api/auth/me')).status).toBe(401);
    expect((await login(app, new CookieJar(), email, password)).status).toBe(401);
    const again = new CookieJar();
    expect((await login(app, again, email, nextPassword)).status).toBe(200);
    const events = await api(app, again, '/api/auth/events');
    const body = (await events.json()) as { events: Array<{ kind: string }> };
    expect(body.events.map((event) => event.kind)).toContain('password_reset');
  });

  it('rejects a reset token on GET and POST after a password change', async () => {
    const jar = new CookieJar();
    const other = new CookieJar();
    await signup(jar, email);
    await api(app, jar, '/api/auth/verify-email', {
      method: 'POST',
      body: { token: tokenFrom(mail, 'Verify') },
    });
    expect((await login(app, jar, email, password)).status).toBe(200);
    expect((await login(app, other, email, password)).status).toBe(200);

    await withCsrf(app, jar);
    expect(
      (await api(app, jar, '/api/auth/request-reset', { method: 'POST', body: { email } })).status,
    ).toBe(200);
    const resetToken = tokenFrom(mail, 'Reset');
    const live = await api(app, new CookieJar(), `/api/auth/reset-password?token=${resetToken}`);
    expect(live.status).toBe(200);
    expect(await live.json()).toEqual({ ok: true });

    const nextPassword = 'horse-battery-staple-21';
    const changed = await api(app, jar, '/api/me/password', {
      method: 'POST',
      body: { currentPassword: password, newPassword: nextPassword },
    });
    expect(changed.status).toBe(200);
    expect(changed.headers.get('cache-control')).toBe('no-store');

    const check = await api(app, new CookieJar(), `/api/auth/reset-password?token=${resetToken}`);
    const missing = await api(
      app,
      new CookieJar(),
      '/api/auth/reset-password?token=not-a-real-token',
    );
    expect(check.status).toBe(400);
    expect(missing.status).toBe(400);
    expect(await check.json()).toEqual({ error: MSG.invalidToken });
    expect(await missing.json()).toEqual({ error: MSG.invalidToken });

    const postJar = new CookieJar();
    await withCsrf(app, postJar);
    const posted = await api(app, postJar, '/api/auth/reset-password', {
      method: 'POST',
      body: { token: resetToken, password: 'horse-battery-staple-22' },
    });
    const postedMissing = await api(app, postJar, '/api/auth/reset-password', {
      method: 'POST',
      body: { token: 'not-a-real-token-value', password: 'horse-battery-staple-22' },
    });
    expect(posted.status).toBe(400);
    expect(postedMissing.status).toBe(400);
    expect(await posted.json()).toEqual({ error: MSG.invalidToken });
    expect(await postedMissing.json()).toEqual({ error: MSG.invalidToken });

    const stored = await db
      .select()
      .from(authTokens)
      .where(eq(authTokens.tokenHash, sha256(resetToken)));
    expect(stored[0]?.usedAt).not.toBeNull();
    expect((await api(app, other, '/api/auth/me')).status).toBe(401);
    expect((await login(app, new CookieJar(), email, password)).status).toBe(401);
    expect((await login(app, new CookieJar(), email, 'horse-battery-staple-22')).status).toBe(401);
    expect((await login(app, new CookieJar(), email, nextPassword)).status).toBe(200);

    await withCsrf(app, jar);
    expect(
      (await api(app, jar, '/api/auth/request-reset', { method: 'POST', body: { email } })).status,
    ).toBe(200);
    const secondToken = tokenFrom(mail, 'Reset');
    const again = await api(app, jar, '/api/auth/change-password', {
      method: 'POST',
      body: { currentPassword: nextPassword, newPassword: 'horse-battery-staple-23' },
    });
    expect(again.status).toBe(200);
    const afterChange = await api(
      app,
      new CookieJar(),
      `/api/auth/reset-password?token=${secondToken}`,
    );
    expect(afterChange.status).toBe(400);
    expect(await afterChange.json()).toEqual({ error: MSG.invalidToken });
  });

  it('rotates this device session on password change and signs everyone out on reset', async () => {
    const current = new CookieJar();
    const other = new CookieJar();
    await signup(current, email);
    await api(app, current, '/api/auth/verify-email', {
      method: 'POST',
      body: { token: tokenFrom(mail, 'Verify') },
    });
    expect((await login(app, current, email, password)).status).toBe(200);
    expect((await login(app, other, email, password)).status).toBe(200);

    await expectRotatedSession(
      current,
      other,
      '/api/me/password',
      password,
      'horse-battery-staple-21',
    );

    const third = new CookieJar();
    expect((await login(app, third, email, 'horse-battery-staple-21')).status).toBe(200);
    await expectRotatedSession(
      current,
      third,
      '/api/auth/change-password',
      'horse-battery-staple-21',
      'horse-battery-staple-23',
    );

    await withCsrf(app, current);
    expect(
      (await api(app, current, '/api/auth/request-reset', { method: 'POST', body: { email } }))
        .status,
    ).toBe(200);
    const fourth = new CookieJar();
    expect((await login(app, fourth, email, 'horse-battery-staple-23')).status).toBe(200);
    const reset = await api(app, current, '/api/auth/reset-password', {
      method: 'POST',
      body: { token: tokenFrom(mail, 'Reset'), password: 'horse-battery-staple-24' },
    });
    expect(reset.status).toBe(200);
    expect(reset.headers.getSetCookie().some((cookie) => cookie.startsWith('__Host-sid='))).toBe(
      false,
    );
    expect((await api(app, current, '/api/auth/me')).status).toBe(401);
    expect((await api(app, fourth, '/api/auth/me')).status).toBe(401);
    expect(await db.select().from(sessions)).toHaveLength(0);
  });

  it('rate limits reset-token checks with one 429 body', async () => {
    const jar = new CookieJar();
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const response = await api(app, jar, `/api/auth/reset-password?token=guess-${attempt}`);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: MSG.invalidToken });
    }
    const limited = await api(app, jar, '/api/auth/reset-password?token=guess-30');
    const limitedAgain = await api(app, jar, '/api/auth/reset-password?token=guess-31');
    expect(limited.status).toBe(429);
    expect(limitedAgain.status).toBe(429);
    expect(await limited.json()).toEqual({ error: MSG.rateLimited });
    expect(await limitedAgain.json()).toEqual({ error: MSG.rateLimited });

    await truncate(db);
    const shared = 'same-token-value';
    let lastStatus = 0;
    for (let attempt = 0; attempt < 11; attempt += 1) {
      const response = await api(app, new CookieJar(), `/api/auth/reset-password?token=${shared}`);
      lastStatus = response.status;
      if (attempt < 10) {
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: MSG.invalidToken });
      } else {
        expect(response.status).toBe(429);
        expect(await response.json()).toEqual({ error: MSG.rateLimited });
      }
    }
    expect(lastStatus).toBe(429);
    const otherToken = await api(app, new CookieJar(), '/api/auth/reset-password?token=different');
    expect(otherToken.status).toBe(400);
    expect(await otherToken.json()).toEqual({ error: MSG.invalidToken });

    await truncate(db);
    await db.insert(rateLimits).values({
      key: 'reset-check-global',
      windowStart: clock.now(),
      count: 100,
      lockedUntil: null,
    });
    const globalHit = await api(app, new CookieJar(), '/api/auth/reset-password?token=global-one');
    const globalAgain = await api(
      app,
      new CookieJar(),
      '/api/auth/reset-password?token=global-two',
    );
    expect(globalHit.status).toBe(429);
    expect(globalAgain.status).toBe(429);
    expect(await globalHit.json()).toEqual({ error: MSG.rateLimited });
    expect(await globalAgain.json()).toEqual({ error: MSG.rateLimited });
  });

  it('signs out one session and every session', async () => {
    const jar = new CookieJar();
    await signup(jar, email);
    await api(app, jar, '/api/auth/verify-email', {
      method: 'POST',
      body: { token: tokenFrom(mail, 'Verify') },
    });
    const other = new CookieJar();
    await login(app, jar, email, password);
    await login(app, other, email, password);
    const mine = await api(app, jar, '/api/auth/sessions');
    const sessions = (await mine.json()) as { sessions: Array<{ id: string; current: boolean }> };
    expect(sessions.sessions).toHaveLength(2);

    const signedOut = await api(app, jar, '/api/auth/logout', { method: 'POST' });
    expect(signedOut.status).toBe(200);
    expect((await api(app, jar, '/api/auth/me')).status).toBe(401);
    expect((await api(app, other, '/api/auth/me')).status).toBe(200);

    const all = await api(app, other, '/api/auth/logout-all', { method: 'POST' });
    expect(all.status).toBe(200);
    expect((await api(app, other, '/api/auth/me')).status).toBe(401);

    const again = new CookieJar();
    expect((await login(app, again, email, password)).status).toBe(200);
    const events = await api(app, again, '/api/auth/events');
    const body = (await events.json()) as { events: Array<{ kind: string }> };
    const kinds = body.events.map((event) => event.kind);
    expect(kinds).toContain('sign_out');
    expect(kinds).toContain('sign_out_all');
  });

  it('drops sessions after the idle window and after the absolute lifetime', async () => {
    const jar = new CookieJar();
    await signup(jar, email);
    await api(app, jar, '/api/auth/verify-email', {
      method: 'POST',
      body: { token: tokenFrom(mail, 'Verify') },
    });
    expect((await login(app, jar, email, password)).status).toBe(200);
    const [person] = await db.select().from(users).where(eq(users.email, email));
    await db
      .update(sessions)
      .set({ lastSeenAt: new Date(clock.now().getTime() - 8 * 24 * 60 * 60 * 1000) })
      .where(eq(sessions.userId, person.id));
    expect((await api(app, jar, '/api/auth/me')).status).toBe(401);

    expect((await login(app, jar, email, password)).status).toBe(200);
    await db
      .update(sessions)
      .set({ expiresAt: new Date(clock.now().getTime() - 1000) })
      .where(eq(sessions.userId, person.id));
    expect((await api(app, jar, '/api/auth/me')).status).toBe(401);
  });

  it('returns one identical 401 for a lock, a wrong password, and an unknown email', async () => {
    const owner = new CookieJar();
    await signup(owner, email);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await login(app, owner, email, 'wrong-password-value')).status).toBe(401);
    }
    const locked = await login(app, owner, email, password);

    const other = new CookieJar();
    await signup(other, 'blair@example.test');
    const wrong = await login(app, other, 'blair@example.test', 'wrong-password-value');
    const missing = await login(app, new CookieJar(), 'missing@example.test', password);

    const lockedSig = await responseSignature(locked);
    const wrongSig = await responseSignature(wrong);
    const missingSig = await responseSignature(missing);
    expect(wrongSig).toEqual(lockedSig);
    expect(missingSig).toEqual(lockedSig);
    expect(lockedSig.status).toBe(401);
    expect(JSON.parse(lockedSig.body)).toEqual({ error: MSG.badLogin });
    expect(lockedSig.body).not.toContain('retryAfter');
    expect(MSG.badLogin).toBe('Email or password is incorrect.');
  });

  it('emails the owner once per lockout and never for an unknown email', async () => {
    const jar = new CookieJar();
    await signup(jar, email);
    mail.clear();

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const response = await api(app, jar, '/api/auth/login', {
        method: 'POST',
        body: { email: 'missing@example.test', password },
        userAgent: 'QA-Device/9',
        forwardedFor: '203.0.113.99',
        remoteAddress: jar.ip,
      });
      expect(response.status).toBe(401);
    }
    expect(mail.messages).toHaveLength(0);

    for (let attempt = 0; attempt < 4; attempt += 1) {
      expect((await failFrom(jar, 'wrong-password-value')).status).toBe(401);
    }
    expect(mail.messages).toHaveLength(0);

    expect((await failFrom(jar, 'wrong-password-value')).status).toBe(401);
    expect(mail.messages).toHaveLength(1);
    const unlockAt = new Date('2026-10-09T18:01:00.000Z');
    expect(mail.messages[0]).toMatchObject({
      to: email,
      subject: 'Your account was temporarily locked',
    });
    expect(mail.messages[0]?.text).toContain('your account was temporarily locked');
    expect(mail.messages[0]?.text).toContain(formatUnlockTime(unlockAt, 'America/Denver'));
    expect(mail.messages[0]?.text).toContain('/reset-password?token=');
    expect(mail.messages[0]?.text).toContain(`IP: ${jar.ip}`);
    expect(mail.messages[0]?.text).toContain('Device: QA-Device/9');
    expect(mail.messages[0]?.text).not.toContain('203.0.113.99');

    expect((await failFrom(jar, password)).status).toBe(401);
    expect((await failFrom(jar, 'wrong-password-value')).status).toBe(401);
    expect(mail.messages).toHaveLength(1);

    clock.set(new Date(clock.now().getTime() + 61_000));
    expect((await failFrom(jar, 'wrong-password-value')).status).toBe(401);
    expect(mail.messages).toHaveLength(2);
    expect(mail.messages[1]?.text).toContain(
      formatUnlockTime(new Date(clock.now().getTime() + 120_000), 'America/Denver'),
    );
    expect((await failFrom(jar, 'wrong-password-value')).status).toBe(401);
    expect(mail.messages).toHaveLength(2);
  });

  it('locks the account after 5 failures and doubles the next lock', async () => {
    const jar = new CookieJar();
    await signup(jar, email);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await login(app, jar, email, 'wrong-password-value');
      expect(response.status).toBe(401);
    }
    const locked = await login(app, jar, email, password);
    expect(locked.status).toBe(401);
    expect(await locked.json()).toEqual({ error: MSG.badLogin });

    clock.set(new Date(clock.now().getTime() + 61_000));
    const stillWrong = await login(app, jar, email, 'wrong-password-value');
    expect(stillWrong.status).toBe(401);

    clock.set(new Date(clock.now().getTime() + 90_000));
    const tooSoon = await login(app, jar, email, password);
    expect(tooSoon.status).toBe(401);

    clock.set(new Date(clock.now().getTime() + 121_000));
    const unlocked = await login(app, jar, email, password);
    expect(unlocked.status).toBe(200);
  });

  it('rejects a breached password and fails open when HIBP is down', async () => {
    hibpState.result = true;
    const jar = new CookieJar();
    const blocked = await signup(jar, email);
    expect(blocked.status).toBe(422);
    const rows = await db.select().from(users).where(eq(users.email, email));
    expect(rows).toHaveLength(0);

    hibpState.result = 'unavailable';
    const allowed = await signup(jar, email);
    expect(allowed.status).toBe(200);
    const created = await db.select().from(users).where(eq(users.email, email));
    expect(created).toHaveLength(1);
  });

  it('enforces a fixed window in rate_limits', async () => {
    const now = clock.now();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(await consumeRateLimit(db, 'signup-ip:203.0.113.10', 5, 60_000, now)).toBe(true);
    }
    expect(await consumeRateLimit(db, 'signup-ip:203.0.113.10', 5, 60_000, now)).toBe(false);
    expect(
      await consumeRateLimit(
        db,
        'signup-ip:203.0.113.10',
        5,
        60_000,
        new Date(now.getTime() + 60_000),
      ),
    ).toBe(true);
  });

  it('rejects oversized bodies', async () => {
    const jar = new CookieJar();
    await withCsrf(app, jar);
    const response = await api(app, jar, '/api/auth/login', {
      method: 'POST',
      body: { email, password: 'x'.repeat(70_000) },
    });
    expect(response.status).toBe(413);
  });

  it('seeds a verified demo user that expires in 24 hours and cannot change password', async () => {
    const jar = new CookieJar();
    await withCsrf(app, jar);
    const created = await api(app, jar, '/api/demo', { method: 'POST' });
    expect(created.status).toBe(201);
    const body = (await created.json()) as {
      user: { isDemo: boolean; emailVerified: boolean; email: string; demoExpiresAt: string };
      applications: Array<{ company: string }>;
    };
    expect(body.user.isDemo).toBe(true);
    expect(body.user.emailVerified).toBe(true);
    expect(body.user.email.endsWith('@example.test')).toBe(true);
    const expiry = new Date(body.user.demoExpiresAt).getTime() - clock.now().getTime();
    expect(expiry).toBe(24 * 60 * 60 * 1000);
    expect(body.applications.map((item) => item.company).sort()).toEqual(
      ['Acme Robotics', 'Globex', 'Hooli', 'Initech', 'Northwind Labs'].sort(),
    );

    const listed = await api(app, jar, '/api/applications');
    expect(listed.status).toBe(200);
    const listBody = (await listed.json()) as { applications: unknown[] };
    expect(listBody.applications).toHaveLength(5);

    const change = await api(app, jar, '/api/auth/change-password', {
      method: 'POST',
      body: { currentPassword: 'whatever-password', newPassword: 'horse-battery-staple-77' },
    });
    expect(change.status).toBe(403);

    const stranger = new CookieJar();
    await signup(stranger, 'blair@example.test');
    await api(app, stranger, '/api/auth/verify-email', {
      method: 'POST',
      body: { token: tokenFrom(mail, 'Verify') },
    });
    await login(app, stranger, 'blair@example.test', password);
    const hidden = await api(app, stranger, '/api/applications');
    const hiddenBody = (await hidden.json()) as { applications: unknown[] };
    expect(hiddenBody.applications).toHaveLength(0);

    const removed = await deleteExpiredDemoUsers(
      db,
      new Date(clock.now().getTime() + 25 * 60 * 60 * 1000),
    );
    expect(removed).toBe(1);
    const demoLeft = await db.select().from(users).where(eq(users.isDemo, true));
    expect(demoLeft).toHaveLength(0);
    const people = await db.select().from(users);
    expect(people.map((person) => person.email)).toEqual(['blair@example.test']);
  });

  async function expectRotatedSession(
    current: CookieJar,
    other: CookieJar,
    path: '/api/me/password' | '/api/auth/change-password',
    currentPassword: string,
    newPassword: string,
  ) {
    const before = await api(app, current, '/api/auth/sessions');
    const beforeBody = (await before.json()) as {
      sessions: Array<{ id: string; current: boolean }>;
    };
    const oldId = beforeBody.sessions.find((row) => row.current)?.id;
    const oldCookie = current.get('__Host-sid');
    expect(oldId).toBeTruthy();
    expect(oldCookie).toBeTruthy();

    await withCsrf(app, current);
    const changed = await api(app, current, path, {
      method: 'POST',
      body: { currentPassword, newPassword },
    });
    expect(changed.status).toBe(200);
    const issued = changed.headers
      .getSetCookie()
      .find((cookie) => cookie.startsWith('__Host-sid=') && !cookie.includes('Max-Age=0'));
    expect(issued).toBeDefined();
    expect(issued).toContain('HttpOnly');
    expect(issued).toContain('Secure');
    expect(issued).toContain('Path=/');
    const newCookie = issued?.split(';')[0]?.slice('__Host-sid='.length);
    expect(newCookie).toBeTruthy();
    expect(newCookie).not.toBe(oldCookie);
    expect(current.get('__Host-sid')).toBe(newCookie);

    const me = await api(app, current, '/api/auth/me');
    expect(me.status).toBe(200);
    await withCsrf(app, current);
    const onMe = await api(app, current, '/api/me/password', {
      method: 'POST',
      body: { currentPassword: 'wrong-current-password', newPassword: 'horse-battery-staple-77' },
    });
    expect(onMe.status).toBe(401);
    expect(await onMe.json()).toEqual({ error: MSG.currentPassword });

    const stale = new CookieJar();
    stale.set('__Host-sid', oldCookie ?? '');
    expect((await api(app, stale, '/api/auth/me')).status).toBe(401);
    expect((await api(app, other, '/api/auth/me')).status).toBe(401);
    expect(
      await db
        .select()
        .from(sessions)
        .where(eq(sessions.id, oldId ?? '')),
    ).toHaveLength(0);

    const after = await api(app, current, '/api/auth/sessions');
    const afterBody = (await after.json()) as {
      sessions: Array<{ id: string; current: boolean }>;
    };
    expect(afterBody.sessions).toHaveLength(1);
    expect(afterBody.sessions[0]?.current).toBe(true);
    expect(afterBody.sessions[0]?.id).not.toBe(oldId);
  }

  async function failFrom(jar: CookieJar, secret: string) {
    return api(app, jar, '/api/auth/login', {
      method: 'POST',
      body: { email, password: secret },
      userAgent: 'QA-Device/9',
      forwardedFor: '203.0.113.99',
      remoteAddress: jar.ip,
    });
  }

  async function signup(jar: CookieJar, address: string) {
    await withCsrf(app, jar);
    return api(app, jar, '/api/auth/signup', {
      method: 'POST',
      body: { email: address, password, timeZone: 'America/Denver' },
    });
  }
});

async function responseSignature(response: Response) {
  const headers = [...response.headers.entries()]
    .map(([name, value]) => [name.toLowerCase(), value] as const)
    .sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));
  const setCookie =
    typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
  return { status: response.status, body: await response.text(), headers, setCookie };
}
