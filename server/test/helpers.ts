import { sql as drizzleSql } from 'drizzle-orm';
import { createApp } from '../src/app.js';
import type { HibpResult } from '../src/auth/hibp.js';
import { dummyPasswordHash } from '../src/auth/password.js';
import { createClock } from '../src/clock.js';
import { createDb, type Database } from '../src/db/client.js';
import type { Env } from '../src/env.js';
import { MemoryMailTransport } from '../src/mail/transport.js';

export function testEnv(): Env {
  const databaseUrl = process.env.DATABASE_URL;
  const sessionSecret = process.env.SESSION_SECRET;
  const encryptionKey = process.env.ENCRYPTION_KEY;
  const appUrl = process.env.APP_URL;
  if (!databaseUrl || !sessionSecret || !encryptionKey || !appUrl) {
    throw new Error('test env is incomplete');
  }
  return {
    NODE_ENV: 'test',
    DATABASE_URL: databaseUrl,
    SESSION_SECRET: sessionSecret,
    ENCRYPTION_KEY: encryptionKey,
    APP_URL: appUrl.replace(/\/$/, ''),
    PORT: 3000,
    MAIL_FROM: 'Pipeline <noreply@example.test>',
    MAIL_TRANSPORT: 'memory',
    TRUSTED_PROXY_HOPS: 0,
  };
}

export type TestApp = ReturnType<typeof createApp>;

export async function boot(
  hibp: (password: string) => Promise<HibpResult> = async () => false,
  trustedProxyHops = 0,
) {
  const env = { ...testEnv(), TRUSTED_PROXY_HOPS: trustedProxyHops };
  const { db, sql } = createDb(env.DATABASE_URL);
  const mail = new MemoryMailTransport();
  const clock = createClock(new Date('2026-10-09T18:00:00.000Z'));
  const app = createApp({ db, mail, clock, env, hibp });
  await dummyPasswordHash();
  return { app, db, sql, mail, clock, env };
}

export async function truncate(db: Database) {
  await db.execute(
    drizzleSql`TRUNCATE TABLE rate_limits, auth_events, auth_tokens, sessions, stage_events, applications, users CASCADE`,
  );
}

let ipCounter = 0;

export class CookieJar {
  private readonly cookies = new Map<string, string>();
  readonly ip: string;

  constructor() {
    ipCounter += 1;
    const hi = (ipCounter >> 8) & 255;
    const lo = ipCounter & 255;
    this.ip = `198.51.${hi}.${lo === 0 ? 1 : lo}`;
  }

  absorb(response: Response) {
    const list =
      typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
    for (const cookie of list) {
      const [pair] = cookie.split(';');
      const eq = pair.indexOf('=');
      if (eq === -1) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1);
      if (!value) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  header(): string {
    return [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
  }

  get(name: string): string | undefined {
    return this.cookies.get(name);
  }
}

export async function api(
  app: TestApp,
  jar: CookieJar,
  path: string,
  init: {
    method?: string;
    body?: unknown;
    origin?: string | null;
    csrf?: boolean;
    /** Full X-Forwarded-For header. Null omits it. Default is the jar address. */
    forwardedFor?: string | null;
    /** Socket remote address. Default is the jar address. */
    remoteAddress?: string;
    userAgent?: string;
  } = {},
) {
  const method = init.method ?? 'GET';
  const headers: Record<string, string> = {};
  if (init.forwardedFor !== null) headers['x-forwarded-for'] = init.forwardedFor ?? jar.ip;
  if (init.userAgent) headers['user-agent'] = init.userAgent;
  const cookie = jar.header();
  if (cookie) headers.cookie = cookie;
  if (method !== 'GET' && method !== 'HEAD') {
    if (init.origin !== null)
      headers.origin = init.origin ?? process.env.APP_URL ?? 'http://localhost:3000';
    if (init.csrf !== false) {
      const csrf = jar.get('__Host-csrf');
      if (csrf) headers['x-csrf-token'] = csrf;
    }
    if (init.body !== undefined) headers['content-type'] = 'application/json';
  }
  const response = await app.request(
    path,
    {
      method,
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    },
    {
      incoming: { socket: { remoteAddress: init.remoteAddress ?? jar.ip } },
    },
  );
  jar.absorb(response);
  return response;
}

export async function withCsrf(app: TestApp, jar: CookieJar) {
  const response = await api(app, jar, '/api/auth/csrf');
  if (!response.ok) throw new Error(`csrf failed: ${response.status}`);
  return response;
}

export async function login(app: TestApp, jar: CookieJar, email: string, password: string) {
  await withCsrf(app, jar);
  return api(app, jar, '/api/auth/login', { method: 'POST', body: { email, password } });
}

export function tokenFrom(mail: MemoryMailTransport, subjectPart: string): string {
  const message = [...mail.messages].reverse().find((item) => item.subject.includes(subjectPart));
  const match = message?.text.match(/token=([A-Za-z0-9_-]+)/);
  if (!match?.[1]) throw new Error(`no ${subjectPart} token in mail sink`);
  return match[1];
}
