import { and, eq, inArray } from 'drizzle-orm';
import {
  computeTimeline,
  lastActivityAt,
  localDate,
  STAGES,
  type Stage,
  type Visit,
} from '@pipeline/shared';
import type { Database } from '../db/client.js';
import { applications, stageEvents } from '../db/schema.js';
import type { SessionUser } from '../deps.js';

type AppRow = typeof applications.$inferSelect;
type EventRow = typeof stageEvents.$inferSelect;

export type ApplicationVisit = Visit & {
  visitNumber: number;
  occurredAt: string;
  note: string | null;
};

export type ApplicationDetail = {
  id: string;
  company: string;
  role: string;
  url: string | null;
  notes: string;
  appliedOn: string;
  createdAt: string;
  updatedAt: string;
  currentStage: Stage;
  lastActivity: string;
  lastActivityAt: string;
  lastActivityKind: 'stage_change' | 'edited';
  lastActivityStage: Stage | null;
  visits: ApplicationVisit[];
  totals: Partial<Record<Stage, number>>;
  visitCounts: Partial<Record<Stage, number>>;
  latestEventAt: string;
  latestEventLocalDate: string;
  timeZone: string;
  today: string;
};

export type ApplicationListItem = {
  id: string;
  company: string;
  role: string;
  currentStage: Stage;
  daysInCurrentStage: number;
  lastActivity: string;
  lastActivityAt: string;
  lastActivityKind: 'stage_change' | 'edited';
  lastActivityStage: Stage | null;
};

export type ApplicationListResponse = {
  applications: ApplicationListItem[];
  total: number;
  countsByStage: Record<Stage, number>;
  unfilteredTotal: number;
};

function sortedEvents(events: EventRow[]): EventRow[] {
  return [...events].sort((a, b) => {
    const delta = a.occurredAt.getTime() - b.occurredAt.getTime();
    if (delta !== 0) return delta;
    return a.id.localeCompare(b.id);
  });
}

export function presentDetail(
  app: AppRow,
  events: EventRow[],
  timeZone: string,
  now: Date,
): ApplicationDetail {
  const ordered = sortedEvents(events);
  const today = localDate(now, timeZone);
  const timeline = computeTimeline(
    ordered.map((event) => ({
      id: event.id,
      stage: event.stage,
      occurredAt: event.occurredAt,
    })),
    timeZone,
    today,
  );
  const latest = ordered[ordered.length - 1];
  const lastActivity = lastActivityAt(latest.occurredAt, app.updatedAt);
  const edited =
    app.updatedAt.getTime() > app.createdAt.getTime() &&
    app.updatedAt.getTime() > latest.occurredAt.getTime();
  const visitCounts: Partial<Record<Stage, number>> = {};
  const visits: ApplicationVisit[] = timeline.visits.map((visit, index) => {
    const visitNumber = (visitCounts[visit.stage] ?? 0) + 1;
    visitCounts[visit.stage] = visitNumber;
    return {
      ...visit,
      visitNumber,
      occurredAt: ordered[index].occurredAt.toISOString(),
      note: ordered[index].note,
    };
  });
  return {
    id: app.id,
    company: app.company,
    role: app.role,
    url: app.url,
    notes: app.notes,
    appliedOn: app.appliedOn,
    createdAt: app.createdAt.toISOString(),
    updatedAt: app.updatedAt.toISOString(),
    currentStage: timeline.currentStage,
    lastActivity: lastActivity.toISOString(),
    lastActivityAt: lastActivity.toISOString(),
    lastActivityKind: edited ? 'edited' : 'stage_change',
    lastActivityStage: edited ? null : latest.stage,
    visits,
    totals: timeline.totals,
    visitCounts,
    latestEventAt: latest.occurredAt.toISOString(),
    latestEventLocalDate: localDate(latest.occurredAt, timeZone),
    timeZone,
    today,
  };
}

export async function listForUser(
  db: Database,
  user: SessionUser,
  now: Date,
): Promise<ApplicationListItem[]> {
  const apps = await db.select().from(applications).where(eq(applications.userId, user.id));
  if (apps.length === 0) return [];
  const events = await db
    .select()
    .from(stageEvents)
    .where(
      inArray(
        stageEvents.applicationId,
        apps.map((app) => app.id),
      ),
    );
  const byApp = new Map<string, EventRow[]>();
  for (const event of events) {
    const list = byApp.get(event.applicationId) ?? [];
    list.push(event);
    byApp.set(event.applicationId, list);
  }

  const items: ApplicationListItem[] = [];
  for (const app of apps) {
    const appEvents = byApp.get(app.id);
    if (!appEvents || appEvents.length === 0) continue;
    const detail = presentDetail(app, appEvents, user.timeZone, now);
    const currentVisit = detail.visits[detail.visits.length - 1];
    items.push({
      id: detail.id,
      company: detail.company,
      role: detail.role,
      currentStage: detail.currentStage,
      daysInCurrentStage: currentVisit.days,
      lastActivity: detail.lastActivity,
      lastActivityAt: detail.lastActivityAt,
      lastActivityKind: detail.lastActivityKind,
      lastActivityStage: detail.lastActivityStage,
    });
  }

  items.sort((a, b) => {
    const delta = new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime();
    if (delta !== 0) return delta;
    return b.id.localeCompare(a.id);
  });
  return items;
}

export async function ownedApplication(db: Database, userId: string, id: string) {
  const rows = await db
    .select()
    .from(applications)
    .where(and(eq(applications.id, id), eq(applications.userId, userId)));
  return rows[0] ?? null;
}

export async function applicationEvents(db: Database, applicationId: string) {
  return db.select().from(stageEvents).where(eq(stageEvents.applicationId, applicationId));
}

const EMPTY_COUNTS = Object.fromEntries(STAGES.map((stage) => [stage, 0])) as Record<Stage, number>;

/** `q` matches company or role only. `countsByStage` ignores the stage filter so chips stay honest. */
export function queryList(
  items: ApplicationListItem[],
  q: string,
  stage: Stage | null,
): ApplicationListResponse {
  const needle = q.trim().toLowerCase().slice(0, 100);
  const searched = needle
    ? items.filter(
        (item) =>
          item.company.toLowerCase().includes(needle) || item.role.toLowerCase().includes(needle),
      )
    : items;
  const countsByStage = { ...EMPTY_COUNTS };
  for (const item of searched) countsByStage[item.currentStage] += 1;
  const applications = stage ? searched.filter((item) => item.currentStage === stage) : searched;
  return {
    applications,
    total: searched.length,
    countsByStage,
    unfilteredTotal: items.length,
  };
}

export async function detailForUser(
  db: Database,
  user: SessionUser,
  id: string,
  now: Date,
): Promise<ApplicationDetail | null> {
  const app = await ownedApplication(db, user.id, id);
  if (!app) return null;
  const events = await applicationEvents(db, app.id);
  if (events.length === 0) return null;
  return presentDetail(app, events, user.timeZone, now);
}
