import { Hono } from 'hono';
import { and, desc, eq } from 'drizzle-orm';
import { appliedOccurredAt, isStage, localDate } from '@pipeline/shared';
import {
  createApplicationSchema,
  moveStageSchema,
  updateApplicationSchema,
} from '@pipeline/shared';
import { v7 as uuidv7 } from 'uuid';
import { applications, stageEvents } from '../db/schema.js';
import type { AppDeps, AppEnv } from '../deps.js';
import { invalidInput, readJson } from '../http.js';
import { MSG } from '../messages.js';
import {
  detailForUser,
  listForUser,
  ownedApplication,
  presentDetail,
  queryList,
  applicationEvents,
} from './service.js';

export function applicationRoutes(deps: AppDeps) {
  const routes = new Hono<AppEnv>();

  routes.use('*', async (c, next) => {
    if (!c.get('user')) return c.json({ error: MSG.unauthorized }, 401);
    return next();
  });

  routes.get('/', async (c) => {
    const user = c.get('user');
    if (!user) return c.json({ error: MSG.unauthorized }, 401);
    const stageParam = c.req.query('stage');
    if (stageParam && !isStage(stageParam)) return c.json({ error: MSG.invalidInput }, 400);
    const items = await listForUser(deps.db, user, deps.clock.now());
    return c.json(
      queryList(
        items,
        c.req.query('q') ?? '',
        stageParam && isStage(stageParam) ? stageParam : null,
      ),
    );
  });

  routes.post('/', async (c) => {
    const user = c.get('user');
    if (!user) return c.json({ error: MSG.unauthorized }, 401);
    if (!user.emailVerifiedAt) return c.json({ error: MSG.verifyRequired }, 403);

    const parsed = createApplicationSchema.safeParse(await readJson(c));
    if (!parsed.success) return c.json(invalidInput(parsed.error), 400);

    const now = deps.clock.now();
    const today = localDate(now, user.timeZone);
    if (parsed.data.applied_on > today) return c.json({ error: MSG.futureApplied }, 422);

    const id = uuidv7();
    const occurredAt = appliedOccurredAt(parsed.data.applied_on, user.timeZone, now);
    await deps.db.transaction(async (tx) => {
      await tx.insert(applications).values({
        id,
        userId: user.id,
        company: parsed.data.company,
        role: parsed.data.role,
        url: parsed.data.url ?? null,
        notes: parsed.data.notes,
        appliedOn: parsed.data.applied_on,
        createdAt: now,
        updatedAt: now,
      });
      await tx.insert(stageEvents).values({
        id: uuidv7(),
        applicationId: id,
        stage: 'Applied',
        note: null,
        occurredAt,
      });
    });

    const detail = await detailForUser(deps.db, user, id, now);
    if (!detail) return c.json({ error: MSG.internal }, 500);
    return c.json({ application: detail }, 201);
  });

  routes.get('/:id', async (c) => {
    const user = c.get('user');
    if (!user) return c.json({ error: MSG.unauthorized }, 401);
    const detail = await detailForUser(deps.db, user, c.req.param('id'), deps.clock.now());
    if (!detail) return c.json({ error: MSG.notFound }, 404);
    return c.json({ application: detail });
  });

  routes.patch('/:id', async (c) => {
    const user = c.get('user');
    if (!user) return c.json({ error: MSG.unauthorized }, 401);
    const raw = await readJson(c);
    if (raw && typeof raw === 'object' && 'applied_on' in raw) {
      return c.json({ error: 'applied_on cannot be changed' }, 422);
    }
    const parsed = updateApplicationSchema.safeParse(raw);
    if (!parsed.success) return c.json(invalidInput(parsed.error), 400);

    const existing = await ownedApplication(deps.db, user.id, c.req.param('id'));
    if (!existing) return c.json({ error: MSG.notFound }, 404);

    const now = deps.clock.now();
    const patch: {
      updatedAt: Date;
      company?: string;
      role?: string;
      notes?: string;
      url?: string | null;
    } = { updatedAt: now };
    if (parsed.data.company !== undefined) patch.company = parsed.data.company;
    if (parsed.data.role !== undefined) patch.role = parsed.data.role;
    if (parsed.data.notes !== undefined) patch.notes = parsed.data.notes;
    if (parsed.data.url !== undefined) patch.url = parsed.data.url;

    await deps.db
      .update(applications)
      .set(patch)
      .where(and(eq(applications.id, existing.id), eq(applications.userId, user.id)));

    const detail = await detailForUser(deps.db, user, existing.id, now);
    if (!detail) return c.json({ error: MSG.internal }, 500);
    return c.json({ application: detail });
  });

  routes.delete('/:id', async (c) => {
    const user = c.get('user');
    if (!user) return c.json({ error: MSG.unauthorized }, 401);
    const removed = await deps.db
      .delete(applications)
      .where(and(eq(applications.id, c.req.param('id')), eq(applications.userId, user.id)))
      .returning({ id: applications.id });
    if (removed.length === 0) return c.json({ error: MSG.notFound }, 404);
    return c.body(null, 204);
  });

  routes.post('/:id/stages', async (c) => {
    const user = c.get('user');
    if (!user) return c.json({ error: MSG.unauthorized }, 401);
    const raw = await readJson(c);
    const parsed = moveStageSchema.safeParse(raw);
    if (!parsed.success) {
      const tooLong = parsed.error.issues.some(
        (issue) => issue.path[0] === 'note' && issue.code === 'too_big',
      );
      if (tooLong) return c.json({ field: 'note', message: MSG.noteTooLong }, 422);
      return c.json(invalidInput(parsed.error), 400);
    }

    const existing = await ownedApplication(deps.db, user.id, c.req.param('id'));
    if (!existing) return c.json({ error: MSG.notFound }, 404);

    const now = deps.clock.now();
    const latestRows = await deps.db
      .select()
      .from(stageEvents)
      .where(eq(stageEvents.applicationId, existing.id))
      .orderBy(desc(stageEvents.occurredAt), desc(stageEvents.id))
      .limit(1);
    const latest = latestRows[0];
    if (!latest) return c.json({ error: MSG.internal }, 500);

    if (parsed.data.stage === latest.stage) return c.json({ error: MSG.alreadyStage }, 409);

    const occurredAt = parsed.data.occurred_at ? new Date(parsed.data.occurred_at) : now;
    if (Number.isNaN(occurredAt.getTime())) return c.json({ error: MSG.invalidInput }, 400);
    if (occurredAt.getTime() > now.getTime()) return c.json({ error: MSG.futureOccurred }, 422);
    if (occurredAt.getTime() < latest.occurredAt.getTime()) {
      return c.json({ error: MSG.earlierOccurred }, 422);
    }

    await deps.db.insert(stageEvents).values({
      id: uuidv7(),
      applicationId: existing.id,
      stage: parsed.data.stage,
      note: parsed.data.note ?? null,
      occurredAt,
    });

    const events = await applicationEvents(deps.db, existing.id);
    const detail = presentDetail(
      { ...existing, updatedAt: existing.updatedAt },
      events,
      user.timeZone,
      now,
    );
    return c.json({ application: detail }, 201);
  });

  return routes;
}
