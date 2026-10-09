import { serveStatic } from '@hono/node-server/serve-static';
import { eq } from 'drizzle-orm';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { applicationRoutes } from './applications/routes.js';
import { toSessionUser } from './auth/users.js';
import { tokensEqual } from './crypto.js';
import { sessionIdForToken } from './crypto.js';
import { IDLE_MS, sessions, users } from './db/schema.js';
import { demoRoutes } from './demo.js';
import type { AppDeps, AppEnv } from './deps.js';
import { appOrigin } from './env.js';
import { CSRF_COOKIE, SESSION_COOKIE, readCookie } from './http.js';
import { MSG } from './messages.js';
import { authRoutes } from './auth/routes.js';
import { securityHeaders } from './security.js';

export function createApp(deps: AppDeps) {
  const app = new Hono<AppEnv>();

  app.use('*', securityHeaders());
  app.use(
    '*',
    bodyLimit({
      maxSize: 64 * 1024,
      onError: (c) => c.json({ error: 'Payload too large' }, 413),
    }),
  );
  app.use('*', async (c, next) => {
    if (!c.req.path.startsWith('/api') || deps.env.NODE_ENV === 'test') return next();
    const started = Date.now();
    await next();
    const path = new URL(c.req.url).pathname;
    console.info(`${c.req.method} ${path} ${c.res.status} ${Date.now() - started}ms`);
  });
  app.use('*', async (c, next) => {
    c.set('user', null);
    c.set('sessionId', null);
    const token = readCookie(c.req.header('cookie'), SESSION_COOKIE);
    if (!token) return next();

    const id = sessionIdForToken(token, deps.env.SESSION_SECRET);
    const rows = await deps.db.select().from(sessions).where(eq(sessions.id, id));
    const session = rows[0];
    const now = deps.clock.now();
    const idle = session != null && now.getTime() - session.lastSeenAt.getTime() > IDLE_MS;
    const expired = session != null && session.expiresAt.getTime() <= now.getTime();
    if (!session || idle || expired) {
      if (session) await deps.db.delete(sessions).where(eq(sessions.id, id));
      return next();
    }
    if (now.getTime() - session.lastSeenAt.getTime() > 5 * 60 * 1000) {
      await deps.db.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.id, id));
    }
    const userRows = await deps.db.select().from(users).where(eq(users.id, session.userId));
    if (!userRows[0]) return next();
    c.set('sessionId', id);
    c.set('user', toSessionUser(userRows[0]));
    return next();
  });
  app.use('*', async (c, next) => {
    if (c.req.method === 'GET' || c.req.method === 'HEAD' || c.req.method === 'OPTIONS') {
      return next();
    }
    const origin = c.req.header('origin');
    if (origin && origin !== appOrigin(deps.env)) return c.json({ error: MSG.origin }, 403);
    const cookie = readCookie(c.req.header('cookie'), CSRF_COOKIE);
    const header = c.req.header('x-csrf-token');
    if (!cookie || !header || !tokensEqual(cookie, header)) return c.json({ error: MSG.csrf }, 403);
    return next();
  });

  app.get('/api/health', (c) => c.json({ ok: true }));
  app.route('/api/auth', authRoutes(deps));
  app.route('/api', demoRoutes(deps));
  app.route('/api/applications', applicationRoutes(deps));
  mountClient(app);

  app.notFound((c) => {
    if (c.req.path.startsWith('/api')) return c.json({ error: MSG.notFound }, 404);
    return c.text('Not found', 404);
  });
  app.onError((err, c) => {
    console.error(err instanceof Error ? err.message : 'request failed');
    return c.json({ error: MSG.internal }, 500);
  });

  return app;
}

function mountClient(app: Hono<AppEnv>) {
  const clientDist = fileURLToPath(new URL('../../client/dist', import.meta.url));
  if (!existsSync(clientDist)) return;
  app.use('*', async (c, next) => {
    if (c.req.path.startsWith('/api')) return next();
    return serveStatic({ root: clientDist })(c, next);
  });
  app.get('*', async (c, next) => {
    if (c.req.path.startsWith('/api')) return next();
    return serveStatic({ path: 'index.html', root: clientDist })(c, next);
  });
}
