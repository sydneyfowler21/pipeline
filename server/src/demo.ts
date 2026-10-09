import { and, eq, isNotNull, lt } from 'drizzle-orm';
import { localDate, localMidnightUtc, type Stage } from '@pipeline/shared';
import { Hono } from 'hono';
import { v7 as uuidv7 } from 'uuid';
import { listForUser } from './applications/service.js';
import { hashPassword } from './auth/password.js';
import { consumeRateLimit, RATE } from './auth/rate-limit.js';
import { presentUser } from './auth/users.js';
import { newToken, sessionIdForToken } from './crypto.js';
import {
  ABSOLUTE_MS,
  AUTH_EVENT,
  DEMO_TTL_MS,
  applications,
  authEvents,
  sessions,
  stageEvents,
  users,
} from './db/schema.js';
import type { Database } from './db/client.js';
import type { AppDeps, AppEnv } from './deps.js';
import { clientIp, sessionCookie, userAgent } from './http.js';
import { MSG } from './messages.js';

const DEMO_APPS: Array<{
  company: string;
  role: string;
  notes: string;
  stages: Stage[];
  startDaysAgo: number;
}> = [
  {
    company: 'Acme Robotics',
    role: 'Frontend Engineer',
    notes: 'Recruiter replied the same week.',
    stages: ['Applied', 'Screen'],
    startDaysAgo: 21,
  },
  {
    company: 'Northwind Labs',
    role: 'Full-Stack Engineer',
    notes: 'Loop is scheduled.',
    stages: ['Applied', 'Screen', 'Interview'],
    startDaysAgo: 16,
  },
  {
    company: 'Globex',
    role: 'Software Engineer II',
    notes: 'Verbal offer, still reading it.',
    stages: ['Applied', 'Offer'],
    startDaysAgo: 28,
  },
  {
    company: 'Initech',
    role: 'Platform Engineer',
    notes: 'The req was cancelled.',
    stages: ['Applied', 'Closed'],
    startDaysAgo: 11,
  },
  {
    company: 'Hooli',
    role: 'Backend Engineer',
    notes: '',
    stages: ['Applied'],
    startDaysAgo: 4,
  },
];

export async function deleteExpiredDemoUsers(db: Database, now: Date): Promise<number> {
  const removed = await db
    .delete(users)
    .where(
      and(eq(users.isDemo, true), isNotNull(users.demoExpiresAt), lt(users.demoExpiresAt, now)),
    )
    .returning({ id: users.id });
  return removed.length;
}

async function seedDemo(db: Database, userId: string, timeZone: string, now: Date) {
  for (const spec of DEMO_APPS) {
    const appliedInstant = new Date(now.getTime() - spec.startDaysAgo * 86_400_000);
    const appliedOn = localDate(appliedInstant, timeZone);
    const appliedAt = localMidnightUtc(appliedOn, timeZone);
    const applicationId = uuidv7();
    await db.insert(applications).values({
      id: applicationId,
      userId,
      company: spec.company,
      role: spec.role,
      url: `https://example.test/${spec.company.toLowerCase().replace(/\s+/g, '-')}`,
      notes: spec.notes,
      appliedOn,
      createdAt: appliedAt,
      updatedAt: appliedAt,
    });
    for (let index = 0; index < spec.stages.length; index += 1) {
      const occurredAt = new Date(appliedAt.getTime() + index * 3 * 86_400_000);
      await db.insert(stageEvents).values({
        id: uuidv7(),
        applicationId,
        stage: spec.stages[index],
        note: index === 0 ? null : `Moved to ${spec.stages[index]}`,
        occurredAt,
      });
    }
  }
}

export function demoRoutes(deps: AppDeps) {
  const routes = new Hono<AppEnv>();

  routes.post('/demo', async (c) => {
    const now = deps.clock.now();
    const ip = clientIp(c, deps.env.TRUSTED_PROXY_HOPS);
    const agent = userAgent(c);
    const allowed = await consumeRateLimit(
      deps.db,
      `demo-ip:${ip}`,
      RATE.demoIp.max,
      RATE.demoIp.windowMs,
      now,
    );
    if (!allowed) return c.json({ error: MSG.rateLimited }, 429);

    const userId = uuidv7();
    const email = `demo.${userId}@example.test`;
    const expiresAt = new Date(now.getTime() + DEMO_TTL_MS);
    await deps.db.insert(users).values({
      id: userId,
      email,
      passwordHash: await hashPassword(newToken(32)),
      emailVerifiedAt: now,
      timeZone: 'America/Denver',
      isDemo: true,
      demoExpiresAt: expiresAt,
      createdAt: now,
    });
    await seedDemo(deps.db, userId, 'America/Denver', now);

    const token = newToken(32);
    const sessionId = sessionIdForToken(token, deps.env.SESSION_SECRET);
    await deps.db.insert(sessions).values({
      id: sessionId,
      userId,
      createdAt: now,
      lastSeenAt: now,
      expiresAt: new Date(now.getTime() + ABSOLUTE_MS),
      ip,
      userAgent: agent,
      mfaPassed: false,
    });
    await deps.db.insert(authEvents).values({
      id: uuidv7(),
      userId,
      kind: AUTH_EVENT.signIn,
      ip,
      userAgent: agent,
      createdAt: now,
    });

    const user = {
      id: userId,
      email,
      passwordHash: null,
      emailVerifiedAt: now,
      timeZone: 'America/Denver',
      isDemo: true,
      demoExpiresAt: expiresAt,
      createdAt: now,
    };
    c.header('Set-Cookie', sessionCookie(token), { append: true });
    const applications = await listForUser(deps.db, user, now);
    return c.json({ user: presentUser(user), applications }, 201);
  });

  return routes;
}
