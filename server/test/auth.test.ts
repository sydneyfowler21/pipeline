import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { consumeRateLimit, lockoutSeconds } from '../src/auth/rate-limit.js';
import { sessions, users } from '../src/db/schema.js';
import { deleteExpiredDemoUsers } from '../src/demo.js';
import { resolveMailTransport } from '../src/env.js';
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

  async function signup(jar: CookieJar, address: string) {
    await withCsrf(app, jar);
    return api(app, jar, '/api/auth/signup', {
      method: 'POST',
      body: { email: address, password, timeZone: 'America/Denver' },
    });
  }
});
