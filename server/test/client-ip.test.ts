import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sha256, normalizeEmail } from '../src/crypto.js';
import { authEvents, rateLimits, sessions } from '../src/db/schema.js';
import { deriveClientIp } from '../src/http.js';
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
const trusted = '203.0.113.10';
const proxy = '10.0.0.8';

describe('deriveClientIp', () => {
  it('takes the Nth address from the right and ignores a spoofed leftmost hop', () => {
    expect(
      deriveClientIp({
        forwardedFor: '198.51.100.9, 203.0.113.10',
        remoteAddress: proxy,
        trustedProxyHops: 1,
      }),
    ).toBe(trusted);
    expect(
      deriveClientIp({
        forwardedFor: '8.8.8.8, 198.51.100.9, 203.0.113.10',
        remoteAddress: proxy,
        trustedProxyHops: 1,
      }),
    ).toBe(trusted);
  });

  it('falls back to the socket when the header is shorter or the chosen hop is not an IP', () => {
    expect(
      deriveClientIp({
        forwardedFor: '203.0.113.10',
        remoteAddress: proxy,
        trustedProxyHops: 2,
      }),
    ).toBe(proxy);
    expect(
      deriveClientIp({
        forwardedFor: 'not-an-ip',
        remoteAddress: proxy,
        trustedProxyHops: 1,
      }),
    ).toBe(proxy);
    expect(
      deriveClientIp({
        forwardedFor: undefined,
        remoteAddress: proxy,
        trustedProxyHops: 1,
      }),
    ).toBe(proxy);
  });

  it('ignores X-Forwarded-For when trusted hops are 0', () => {
    expect(
      deriveClientIp({
        forwardedFor: '198.51.100.9, 203.0.113.10',
        remoteAddress: proxy,
        trustedProxyHops: 0,
      }),
    ).toBe(proxy);
  });

  it('does not accept a non-IP socket either', () => {
    expect(
      deriveClientIp({
        forwardedFor: 'spoofed',
        remoteAddress: 'also-spoofed',
        trustedProxyHops: 0,
      }),
    ).toBe('unknown');
  });
});

describe('trusted-hop rate limits', () => {
  let db: Database;
  let app: TestApp;
  let mail: MemoryMailTransport;
  let close: () => Promise<void>;

  beforeAll(async () => {
    const ctx = await boot(async () => false, 1);
    db = ctx.db;
    app = ctx.app;
    mail = ctx.mail;
    close = () => ctx.sql.end({ timeout: 5 });
  });

  afterAll(async () => {
    await close();
  });

  beforeEach(async () => {
    mail.clear();
    await truncate(db);
  });

  it('keeps login on one trusted-IP bucket when the leftmost XFF hop rotates', async () => {
    const jar = new CookieJar();
    await signup(jar, email);

    for (let attempt = 1; attempt <= 30; attempt += 1) {
      const response = await postLogin(jar, email, 'wrong-password-value', spoof(attempt));
      expect(response.status, `attempt ${attempt}`).toBe(401);
    }

    const keys = await db.select().from(rateLimits);
    expect(keys.filter((row) => row.key.startsWith('login-ip:')).map((row) => row.key)).toEqual([
      `login-ip:${trusted}`,
    ]);
    expect(
      keys.filter((row) => row.key.startsWith('login-acct-ip:')).map((row) => row.key),
    ).toEqual([`login-acct-ip:${sha256(normalizeEmail(email))}:${trusted}`]);
    expect(keys.some((row) => row.key.includes('198.51.100.'))).toBe(false);

    const blocked = await postLogin(jar, email, 'wrong-password-value', spoof(31));
    expect(blocked.status).toBe(429);

    const other = await postLogin(jar, email, 'wrong-password-value', spoof(32, '203.0.113.11'));
    expect(other.status).toBe(401);
  });

  it('keeps signup on one trusted-IP bucket when the leftmost XFF hop rotates', async () => {
    const jar = new CookieJar();
    await withCsrf(app, jar);
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const response = await postSignup(jar, `user${attempt}@example.test`, spoof(attempt));
      expect(response.status, `attempt ${attempt}`).toBe(200);
    }
    const blocked = await postSignup(jar, 'user6@example.test', spoof(6));
    expect(blocked.status).toBe(429);
    const other = await postSignup(jar, 'user7@example.test', spoof(7, '203.0.113.11'));
    expect(other.status).toBe(200);

    const keys = await db.select().from(rateLimits);
    expect(
      keys
        .filter((row) => row.key.startsWith('signup-ip:'))
        .map((row) => row.key)
        .sort(),
    ).toEqual([`signup-ip:${trusted}`, 'signup-ip:203.0.113.11'].sort());
  });

  it('keeps password-reset requests on one trusted-IP bucket when the leftmost XFF hop rotates', async () => {
    const jar = new CookieJar();
    await signup(jar, email);
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const response = await postReset(jar, spoof(attempt));
      expect(response.status, `attempt ${attempt}`).toBe(200);
    }
    const blocked = await postReset(jar, spoof(6));
    expect(blocked.status).toBe(429);
    const other = await postReset(jar, spoof(7, '203.0.113.11'));
    expect(other.status).toBe(200);

    const keys = await db.select().from(rateLimits);
    expect(
      keys
        .filter((row) => row.key.startsWith('reset-ip:'))
        .map((row) => row.key)
        .sort(),
    ).toEqual([`reset-ip:${trusted}`, 'reset-ip:203.0.113.11'].sort());
  });

  async function signup(jar: CookieJar, address: string) {
    await withCsrf(app, jar);
    const response = await postSignup(jar, address, spoof(1));
    expect(response.status).toBe(200);
    return response;
  }

  function postSignup(jar: CookieJar, address: string, forwardedFor: string) {
    return api(app, jar, '/api/auth/signup', {
      method: 'POST',
      body: { email: address, password, timeZone: 'America/Denver' },
      forwardedFor,
      remoteAddress: proxy,
    });
  }

  function postLogin(jar: CookieJar, address: string, secret: string, forwardedFor: string) {
    return api(app, jar, '/api/auth/login', {
      method: 'POST',
      body: { email: address, password: secret },
      forwardedFor,
      remoteAddress: proxy,
    });
  }

  function postReset(jar: CookieJar, forwardedFor: string) {
    return api(app, jar, '/api/auth/request-reset', {
      method: 'POST',
      body: { email },
      forwardedFor,
      remoteAddress: proxy,
    });
  }
});

describe('hops=0 and the per-account login limit', () => {
  let db: Database;
  let app: TestApp;
  let mail: MemoryMailTransport;
  let clock: ReturnType<typeof createClock>;
  let close: () => Promise<void>;

  beforeAll(async () => {
    const ctx = await boot(async () => false, 0);
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
    mail.clear();
    clock.set(new Date('2026-10-09T18:00:00.000Z'));
    await truncate(db);
  });

  it('ignores X-Forwarded-For and records the socket address', async () => {
    const jar = new CookieJar();
    await withCsrf(app, jar);
    const created = await api(app, jar, '/api/auth/signup', {
      method: 'POST',
      body: { email, password, timeZone: 'America/Denver' },
      forwardedFor: '198.51.100.9, 203.0.113.10',
      remoteAddress: '203.0.113.50',
    });
    expect(created.status).toBe(200);
    await api(app, jar, '/api/auth/verify-email', {
      method: 'POST',
      body: { token: tokenFrom(mail, 'Verify') },
      forwardedFor: '198.51.100.9',
      remoteAddress: '203.0.113.50',
    });
    const loggedIn = await api(app, jar, '/api/auth/login', {
      method: 'POST',
      body: { email, password },
      forwardedFor: '198.51.100.9',
      remoteAddress: '203.0.113.50',
    });
    expect(loggedIn.status).toBe(200);

    const storedSessions = await db.select().from(sessions);
    expect(storedSessions.map((row) => row.ip)).toEqual(['203.0.113.50']);
    const events = await db.select().from(authEvents).where(eq(authEvents.kind, 'sign_in'));
    expect(events.map((row) => row.ip)).toEqual(['203.0.113.50']);
    const keys = await db.select().from(rateLimits);
    expect(keys.some((row) => row.key.includes('198.51.100.9'))).toBe(false);
    expect(keys.some((row) => row.key === 'login-ip:203.0.113.50')).toBe(true);
  });

  it('enforces the per-account login limit across rotating trusted IPs', async () => {
    const owner = new CookieJar();
    await withCsrf(app, owner);
    expect(
      (
        await api(app, owner, '/api/auth/signup', {
          method: 'POST',
          body: { email, password, timeZone: 'America/Denver' },
        })
      ).status,
    ).toBe(200);

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const jar = new CookieJar();
      const response = await login(app, jar, email, 'wrong-password-value');
      expect(response.status).toBe(401);
    }

    clock.set(new Date(clock.now().getTime() + 61_000));
    const fresh = new CookieJar();
    const limited = await login(app, fresh, email, password);
    expect(limited.status).toBe(401);
    expect(await limited.json()).toEqual({ error: MSG.badLogin });

    const keys = await db.select().from(rateLimits);
    const account = keys.find((row) => row.key === `login-acct:${sha256(normalizeEmail(email))}`);
    expect(account?.count).toBe(11);
    const ipKeys = keys.filter((row) => row.key.startsWith('login-ip:'));
    expect(ipKeys.length).toBeGreaterThan(1);
    expect(ipKeys.every((row) => row.count < 11)).toBe(true);
  });
});

function spoof(n: number, right = trusted): string {
  return `198.51.100.${n}, ${right}`;
}
