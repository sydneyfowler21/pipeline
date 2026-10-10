import { and, eq, inArray } from 'drizzle-orm';
import {
  computeTimeline,
  lastActivityAt,
  localDate,
  type Stage,
  type Visit,
} from '@pipeline/shared';
import type { Database } from '../db/client.js';
import { applications, stageEvents } from '../db/schema.js';
import type { SessionUser } from '../deps.js';

type AppRow = typeof applications.$inferSelect;
type EventRow = typeof stageEvents.$inferSelect;

export type ApplicationVisit = Visit & {
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
  visits: ApplicationVisit[];
  totals: Partial<Record<Stage, number>>;
};

export type ApplicationListItem = {
  id: string;
  company: string;
  role: string;
  currentStage: Stage;
  daysInCurrentStage: number;
  lastActivity: string;
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
    visits: timeline.visits.map((visit, index) => ({
      ...visit,
      occurredAt: ordered[index].occurredAt.toISOString(),
      note: ordered[index].note,
    })),
    totals: timeline.totals,
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
