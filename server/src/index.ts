import { serve } from '@hono/node-server';
import { passwordBreachStatus } from './auth/hibp.js';
import { dummyPasswordHash } from './auth/password.js';
import { createApp } from './app.js';
import { createClock, systemClock } from './clock.js';
import { createDb } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { deleteExpiredDemoUsers } from './demo.js';
import { loadEnv } from './env.js';
import { createMailTransport } from './mail/transport.js';

const env = loadEnv();
await dummyPasswordHash();
await runMigrations(env.DATABASE_URL);
const { db, sql } = createDb(env.DATABASE_URL);
const fixedNow = process.env.APP_NOW?.trim();
const clock =
  env.NODE_ENV !== 'production' && fixedNow && !Number.isNaN(new Date(fixedNow).getTime())
    ? createClock(new Date(fixedNow))
    : systemClock;
const app = createApp({
  db,
  mail: createMailTransport(env),
  clock,
  env,
  hibp: (password) => passwordBreachStatus(password),
});

const server = serve({ fetch: app.fetch, hostname: '0.0.0.0', port: env.PORT }, (info) => {
  console.info(`listening on ${info.port}`);
});

const hour = 60 * 60 * 1000;
const timer = setInterval(() => {
  void deleteExpiredDemoUsers(db, new Date()).catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : 'demo cleanup failed');
  });
}, hour);
timer.unref();

void deleteExpiredDemoUsers(db, new Date()).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : 'demo cleanup failed');
});

function shutdown() {
  clearInterval(timer);
  server.close();
  void sql.end({ timeout: 5 });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
