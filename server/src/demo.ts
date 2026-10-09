import { and, eq, isNotNull, lt } from 'drizzle-orm';
import {
  demoRequestSchema,
  isValidTimeZone,
  localDate,
  localMidnightUtc,
  type Stage,
} from '@pipeline/shared';
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
import { clientIp, invalidInput, readJson, sessionCookie, userAgent } from './http.js';
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
    stages: ['Applied', 'Screen', 'Interview', 'Screen', 'Interview', 'Offer'],
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

type HeroEvent = { stage: Stage; occurredAt: string; note: string | null };
type HeroApp = {
  company: string;
  role: string;
  url: string;
  notes: string;
  appliedOn: string;
  updatedAt: string;
  events: HeroEvent[];
};

/** Fixture user A, plus Initech at Screen on Oct 2 and Hooli closed on Sep 10. */
const HERO_APPS: HeroApp[] = [
  {
    company: 'Acme Robotics',
    role: 'Frontend Engineer',
    url: 'https://example.test/acme/frontend',
    notes: 'Panel went well; waiting on offer details.',
    appliedOn: '2026-08-03',
    updatedAt: '2026-08-03T18:00:00Z',
    events: [
      { stage: 'Applied', occurredAt: '2026-08-03T18:00:00Z', note: null },
      { stage: 'Screen', occurredAt: '2026-08-10T16:00:00Z', note: 'Recruiter call' },
      { stage: 'Interview', occurredAt: '2026-08-19T15:30:00Z', note: 'Tech screen' },
      {
        stage: 'Screen',
        occurredAt: '2026-08-24T17:00:00Z',
        note: 'Re-screened for a different team',
      },
      {
        stage: 'Interview',
        occurredAt: '2026-09-01T04:30:00Z',
        note: 'Late-evening invite (Aug 31 local)',
      },
      { stage: 'Offer', occurredAt: '2026-09-14T20:00:00Z', note: 'Verbal offer' },
    ],
  },
  {
    company: 'Northwind Labs',
    role: 'Full-Stack Engineer',
    url: 'https://example.test/northwind/fullstack',
    notes: 'Reopened after the req came back.',
    appliedOn: '2026-09-01',
    updatedAt: '2026-09-01T18:00:00Z',
    events: [
      { stage: 'Applied', occurredAt: '2026-09-01T18:00:00Z', note: null },
      { stage: 'Screen', occurredAt: '2026-09-08T16:00:00Z', note: null },
      { stage: 'Closed', occurredAt: '2026-09-15T21:00:00Z', note: 'Req frozen' },
      { stage: 'Screen', occurredAt: '2026-09-29T15:00:00Z', note: 'Req reopened' },
      { stage: 'Interview', occurredAt: '2026-10-06T16:00:00Z', note: 'Onsite scheduled' },
    ],
  },
  {
    company: 'Globex',
    role: 'Software Engineer II',
    url: 'https://example.test/globex/swe2',
    notes: 'Edited notes after a referral.',
    appliedOn: '2026-09-20',
    updatedAt: '2026-10-08T15:00:00Z',
    events: [{ stage: 'Applied', occurredAt: '2026-09-20T18:00:00Z', note: null }],
  },
  {
    company: 'Initech',
    role: 'Platform Engineer',
    url: 'https://example.test/initech/platform',
    notes: 'Recruiter screen is on the calendar.',
    appliedOn: '2026-09-25',
    updatedAt: '2026-09-25T18:00:00Z',
    events: [
      { stage: 'Applied', occurredAt: '2026-09-25T18:00:00Z', note: null },
      { stage: 'Screen', occurredAt: '2026-10-02T16:00:00Z', note: 'Recruiter call' },
    ],
  },
  {
    company: 'Hooli',
    role: 'Backend Engineer',
    url: 'https://example.test/hooli/backend',
    notes: '',
    appliedOn: '2026-08-20',
    updatedAt: '2026-08-20T18:00:00Z',
    events: [
      { stage: 'Applied', occurredAt: '2026-08-20T18:00:00Z', note: null },
      { stage: 'Closed', occurredAt: '2026-09-10T16:00:00Z', note: 'Role filled' },
    ],
  },
];

export function demoSeedMode(nodeEnv: string, seed: string | undefined): 'default' | 'hero' {
  if (seed === 'hero' && nodeEnv !== 'production') return 'hero';
  return 'default';
}

export function resolveDemoTimeZone(value: string | undefined): string {
  if (value && isValidTimeZone(value)) return value;
  return 'America/Denver';
}

async function seedHero(db: Database, userId: string) {
  for (const spec of HERO_APPS) {
    const applicationId = uuidv7();
    const updatedAt = new Date(spec.updatedAt);
    const createdAt = new Date(spec.events[0]?.occurredAt ?? spec.updatedAt);
    await db.insert(applications).values({
      id: applicationId,
      userId,
      company: spec.company,
      role: spec.role,
      url: spec.url,
      notes: spec.notes,
      appliedOn: spec.appliedOn,
      createdAt,
      updatedAt,
    });
    for (const event of spec.events) {
      await db.insert(stageEvents).values({
        id: uuidv7(),
        applicationId,
        stage: event.stage,
        note: event.note,
        occurredAt: new Date(event.occurredAt),
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

    const raw = await readJson(c);
    let requestedZone: string | undefined;
    let requestedSeed: string | undefined;
    if (raw != null) {
      const parsed = demoRequestSchema.safeParse(raw);
      if (!parsed.success) return c.json(invalidInput(parsed.error), 400);
      requestedZone = parsed.data.timeZone;
      requestedSeed = parsed.data.seed;
    }
    const timeZone = resolveDemoTimeZone(requestedZone);
    const mode = demoSeedMode(deps.env.NODE_ENV, requestedSeed);

    const userId = uuidv7();
    const email = `demo.${userId}@example.test`;
    const expiresAt = new Date(now.getTime() + DEMO_TTL_MS);
    await deps.db.insert(users).values({
      id: userId,
      email,
      passwordHash: await hashPassword(newToken(32)),
      emailVerifiedAt: now,
      timeZone,
      isDemo: true,
      demoExpiresAt: expiresAt,
      createdAt: now,
    });
    if (mode === 'hero') await seedHero(deps.db, userId);
    else await seedDemo(deps.db, userId, timeZone, now);

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
      timeZone,
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
