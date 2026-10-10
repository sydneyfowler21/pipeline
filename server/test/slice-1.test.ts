import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { eq, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hashPassword } from '../src/auth/password.js';
import { applications, stageEvents, users } from '../src/db/schema.js';
import type { Stage } from '@pipeline/shared';
import { api, boot, CookieJar, login, truncate, withCsrf, type TestApp } from './helpers.js';
import type { Database } from '../src/db/client.js';

type FixtureVisit = {
  stage: Stage;
  enteredLocal: string;
  days: number;
  current?: boolean;
};

type FixtureApp = {
  key: string;
  user: string;
  company: string;
  role: string;
  url: string;
  notes: string;
  applied_on: string;
  updated_at: string;
  events: Array<{ stage: Stage; occurred_at: string; note: string | null }>;
  expected: {
    currentStage: Stage;
    visits: FixtureVisit[];
    totals: Record<string, number>;
    lastActivity: string;
  };
};

type IsolationCase = {
  as: string;
  request: string;
  expectKeys?: string[];
  ids?: string[];
  expectStatus?: number;
};

type StageCase = {
  app: string;
  stage: Stage;
  occurred_at?: string;
  expectStatus: number;
  reason: string;
};

type Fixture = {
  now: string;
  timeZone: string;
  today: string;
  users: Array<{ key: string; email: string; password: string; timeZone: string }>;
  applications: FixtureApp[];
  expectedListOrder: Record<string, string[]>;
  isolation: IsolationCase[];
  stageChangeValidation: StageCase[];
};

const fixture = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../fixtures/slice-1.json', import.meta.url)), 'utf8'),
) as Fixture;

type Ids = { users: Record<string, string>; apps: Record<string, string> };

function visitShape(visits: Array<FixtureVisit & { note?: string | null; occurredAt?: string }>) {
  return visits.map((visit) => {
    const shaped: FixtureVisit = {
      stage: visit.stage,
      enteredLocal: visit.enteredLocal,
      days: visit.days,
    };
    if (visit.current) shaped.current = true;
    return shaped;
  });
}

describe('slice-1 fixture', () => {
  let db: Database;
  let app: TestApp;
  let close: () => Promise<void>;
  let clock: { now(): Date; set(next: Date): void };
  let ids: Ids;
  let hashes: Record<string, string>;
  const jars = new Map<string, CookieJar>();

  beforeAll(async () => {
    const ctx = await boot();
    db = ctx.db;
    app = ctx.app;
    clock = ctx.clock;
    close = () => ctx.sql.end({ timeout: 5 });
    ctx.clock.set(new Date(fixture.now));
    hashes = {};
    for (const user of fixture.users) {
      hashes[user.key] = await hashPassword(user.password);
    }
  });

  afterAll(async () => {
    await close();
  });

  beforeEach(async () => {
    await truncate(db);
    jars.clear();
    ids = { users: {}, apps: {} };
    const now = new Date(fixture.now);
    for (const user of fixture.users) {
      const id = uuidv7();
      ids.users[user.key] = id;
      await db.insert(users).values({
        id,
        email: user.email,
        passwordHash: hashes[user.key],
        emailVerifiedAt: now,
        timeZone: user.timeZone,
        isDemo: false,
        demoExpiresAt: null,
        createdAt: now,
      });
      const jar = new CookieJar();
      const response = await login(app, jar, user.email, user.password);
      expect(response.status).toBe(200);
      jars.set(user.key, jar);
    }
    for (const application of fixture.applications) {
      const id = uuidv7();
      ids.apps[application.key] = id;
      await db.insert(applications).values({
        id,
        userId: ids.users[application.user],
        company: application.company,
        role: application.role,
        url: application.url,
        notes: application.notes,
        appliedOn: application.applied_on,
        createdAt: new Date(application.updated_at),
        updatedAt: new Date(application.updated_at),
      });
      for (const event of application.events) {
        await db.insert(stageEvents).values({
          id: uuidv7(),
          applicationId: id,
          stage: event.stage,
          note: event.note,
          occurredAt: new Date(event.occurred_at),
        });
      }
    }
  });

  it('stores argon2id hashes with the spec parameters', async () => {
    const rows = await db.select({ passwordHash: users.passwordHash }).from(users);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    }
  });

  it('lists by last activity and returns per-visit days plus per-stage totals', async () => {
    for (const [userKey, order] of Object.entries(fixture.expectedListOrder)) {
      const jar = jars.get(userKey);
      if (!jar) throw new Error(`missing jar ${userKey}`);
      const response = await api(app, jar, '/api/applications');
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        applications: Array<{ id: string; daysInCurrentStage: number; lastActivity: string }>;
      };
      const keys = body.applications.map(
        (item) => Object.entries(ids.apps).find(([, id]) => id === item.id)?.[0],
      );
      expect(keys).toEqual(order);
    }

    for (const application of fixture.applications) {
      const jar = jars.get(application.user);
      if (!jar) throw new Error(`missing jar ${application.user}`);
      const response = await api(app, jar, `/api/applications/${ids.apps[application.key]}`);
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        application: {
          currentStage: string;
          lastActivity: string;
          visits: FixtureVisit[];
          totals: Record<string, number>;
        };
      };
      expect(body.application.currentStage).toBe(application.expected.currentStage);
      expect(visitShape(body.application.visits)).toEqual(application.expected.visits);
      expect(body.application.totals).toEqual(application.expected.totals);
      expect(new Date(body.application.lastActivity).toISOString()).toBe(
        new Date(application.expected.lastActivity).toISOString(),
      );
    }
  });

  it('returns 404 for every other-user id on the fixture endpoints', async () => {
    for (const item of fixture.isolation) {
      const jar = jars.get(item.as);
      if (!jar) throw new Error(`missing jar ${item.as}`);
      const [method, template] = item.request.split(' ');
      if (!method || !template) throw new Error(`bad request ${item.request}`);
      if (item.expectKeys) {
        const response = await api(app, jar, template);
        expect(response.status).toBe(200);
        const body = (await response.json()) as { applications: Array<{ id: string }> };
        const keys = body.applications.map(
          (row) => Object.entries(ids.apps).find(([, id]) => id === row.id)?.[0],
        );
        expect(keys).toEqual(item.expectKeys);
        continue;
      }
      for (const key of item.ids ?? []) {
        const path = template.replace(':id', ids.apps[key] ?? key);
        const init: { method: string; body?: unknown } = { method };
        if (method === 'PATCH') init.body = { notes: 'cross-user write' };
        if (method === 'POST') init.body = { stage: 'Closed' };
        const response = await api(app, jar, path, init);
        expect(response.status, `${item.as} ${item.request} ${key}`).toBe(item.expectStatus);
        expect(response.status).not.toBe(403);
        const body = (await response.json()) as { error: string };
        expect(body.error).toBe('Not found');
      }
    }

    const owner = jars.get('A');
    if (!owner) throw new Error('missing owner');
    const still = await api(app, owner, `/api/applications/${ids.apps.A1}`);
    expect(still.status).toBe(200);
    const body = (await still.json()) as { application: { notes: string } };
    expect(body.application.notes).toBe('Panel went well; waiting on offer details.');
  });

  it('rejects raw updates and deletes, and cascades when the application is deleted', async () => {
    const eventRows = await db
      .select()
      .from(stageEvents)
      .where(eq(stageEvents.applicationId, ids.apps.A1));
    const eventId = eventRows[0]?.id;
    if (!eventId) throw new Error('missing event');

    await expect(
      db.execute(sql`UPDATE stage_events SET note = 'tamper' WHERE id = ${eventId}`),
    ).rejects.toSatisfy((err: unknown) => /append-only/.test(errorText(err)));
    await expect(db.execute(sql`DELETE FROM stage_events WHERE id = ${eventId}`)).rejects.toSatisfy(
      (err: unknown) => /append-only/.test(errorText(err)),
    );

    const still = await db.select().from(stageEvents).where(eq(stageEvents.id, eventId));
    expect(still).toHaveLength(1);

    const owner = jars.get('A');
    if (!owner) throw new Error('missing owner');
    await withCsrf(app, owner);
    const removed = await api(app, owner, `/api/applications/${ids.apps.A2}`, { method: 'DELETE' });
    expect(removed.status).toBe(204);
    const gone = await db
      .select()
      .from(stageEvents)
      .where(eq(stageEvents.applicationId, ids.apps.A2));
    expect(gone).toHaveLength(0);

    await db.delete(applications).where(eq(applications.id, ids.apps.A1));
    const cascaded = await db
      .select()
      .from(stageEvents)
      .where(eq(stageEvents.applicationId, ids.apps.A1));
    expect(cascaded).toHaveLength(0);
  });

  it('follows the fixture occurred_at rules', async () => {
    const ownerKey = fixture.applications.find((item) => item.key === 'B1')?.user;
    if (!ownerKey) throw new Error('missing B1');
    const jar = jars.get(ownerKey);
    if (!jar) throw new Error('missing jar');
    for (const change of fixture.stageChangeValidation) {
      const response = await api(app, jar, `/api/applications/${ids.apps[change.app]}/stages`, {
        method: 'POST',
        body: {
          stage: change.stage,
          ...(change.occurred_at ? { occurred_at: change.occurred_at } : {}),
        },
      });
      expect(response.status, change.reason).toBe(change.expectStatus);
      if (change.expectStatus === 409) {
        const body = (await response.json()) as { error: string };
        expect(body.error).toBe('Already in this stage');
      }
      if (change.expectStatus === 422 && change.reason === 'future') {
        const body = (await response.json()) as { error: string };
        expect(body.error).toMatch(/future/);
      }
      if (change.expectStatus === 422 && change.reason === 'before latest event') {
        const body = (await response.json()) as { error: string };
        expect(body.error).toMatch(/earlier/);
      }
    }
  });

  it('writes a past Applied event at local midnight and rejects a future applied_on', async () => {
    const jar = jars.get('A');
    if (!jar) throw new Error('missing jar');
    const created = await api(app, jar, '/api/applications', {
      method: 'POST',
      body: {
        company: 'Hooli',
        role: 'Backend Engineer',
        applied_on: '2026-08-03',
        notes: 'Referral from a friend.',
      },
    });
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as {
      application: { id: string; visits: Array<{ stage: string; occurredAt: string }> };
    };
    expect(createdBody.application.visits[0]).toMatchObject({
      stage: 'Applied',
      occurredAt: '2026-08-03T06:00:00.000Z',
    });

    const future = await api(app, jar, '/api/applications', {
      method: 'POST',
      body: { company: 'Hooli', role: 'Backend Engineer', applied_on: '2026-10-10' },
    });
    expect(future.status).toBe(422);

    const badUrl = await api(app, jar, '/api/applications', {
      method: 'POST',
      body: {
        company: 'Hooli',
        role: 'Backend Engineer',
        applied_on: '2026-08-03',
        url: 'javascript:alert(1)',
      },
    });
    expect(badUrl.status).toBe(400);

    const edited = await api(app, jar, `/api/applications/${createdBody.application.id}`, {
      method: 'PATCH',
      body: { notes: 'Updated summary.' },
    });
    expect(edited.status).toBe(200);
    const editedBody = (await edited.json()) as {
      application: { updatedAt: string; notes: string };
    };
    expect(editedBody.application.notes).toBe('Updated summary.');
    expect(editedBody.application.updatedAt).toBe('2026-10-09T18:00:00.000Z');

    const lockedDate = await api(app, jar, `/api/applications/${createdBody.application.id}`, {
      method: 'PATCH',
      body: { applied_on: '2026-08-01' },
    });
    expect(lockedDate.status).toBe(422);
  });

  it('lets a stage move with the default date succeed right after creating an application today', async () => {
    const jar = jars.get('A');
    if (!jar) throw new Error('missing jar');
    // 08:00 America/Denver on the fixture's today. Noon would still be in the future.
    const morning = new Date('2026-10-09T14:00:00.000Z');
    clock.set(morning);
    try {
      const created = await api(app, jar, '/api/applications', {
        method: 'POST',
        body: {
          company: 'Initech',
          role: 'Platform Engineer',
          applied_on: '2026-10-09',
        },
      });
      expect(created.status).toBe(201);
      const createdBody = (await created.json()) as {
        application: { id: string; visits: Array<{ stage: string; occurredAt: string }> };
      };
      expect(createdBody.application.visits[0]).toMatchObject({
        stage: 'Applied',
        occurredAt: morning.toISOString(),
      });

      const moved = await api(app, jar, `/api/applications/${createdBody.application.id}/stages`, {
        method: 'POST',
        body: { stage: 'Screen' },
      });
      expect(moved.status).toBe(201);
      const movedBody = (await moved.json()) as {
        application: { currentStage: string; visits: Array<{ stage: string; occurredAt: string }> };
      };
      expect(movedBody.application.currentStage).toBe('Screen');
      expect(movedBody.application.visits.at(-1)).toMatchObject({
        stage: 'Screen',
        occurredAt: morning.toISOString(),
      });
    } finally {
      clock.set(new Date(fixture.now));
    }
  });

  it('has no status column and installs the append-only trigger', async () => {
    const columns = await db.execute<{ column_name: string }>(
      sql`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name IN ('applications', 'stage_events')`,
    );
    const names = asRows<{ column_name: string }>(columns).map((row) => row.column_name);
    expect(names).not.toContain('status');
    expect(names).toContain('updated_at');

    const triggers = await db.execute<{ tgname: string }>(
      sql`SELECT tgname FROM pg_trigger WHERE tgname = 'stage_events_append_only' AND NOT tgisinternal`,
    );
    expect(asRows(triggers)).toHaveLength(1);
  });
});

function errorText(err: unknown): string {
  const parts: string[] = [];
  let current: unknown = err;
  for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
    parts.push(current.message);
    current = current.cause;
  }
  return parts.join('\n');
}

function asRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === 'object' && 'rows' in result && Array.isArray(result.rows)) {
    return result.rows as T[];
  }
  return [];
}
