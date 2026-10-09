import type { Stage } from './stages.js';
import { daysBetween, localDate } from './time.js';

export type TimelineEvent = {
  id?: string;
  stage: Stage;
  occurredAt: Date | string;
};

export type Visit = {
  stage: Stage;
  enteredLocal: string;
  days: number;
  current?: true;
};

export type Timeline = {
  currentStage: Stage;
  visits: Visit[];
  totals: Partial<Record<Stage, number>>;
};

function instant(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

/**
 * Days in stage are calendar dates in the user's time zone, not 24-hour periods.
 * A visit lasts until the next event's local date, or until `today` when it is current.
 * Revisits stay as separate visits; totals sum every visit of that stage.
 */
export function computeTimeline(
  events: TimelineEvent[],
  timeZone: string,
  today: string,
): Timeline {
  if (events.length === 0) {
    throw new Error('computeTimeline requires at least one event');
  }

  const sorted = [...events].sort((a, b) => {
    const delta = instant(a.occurredAt).getTime() - instant(b.occurredAt).getTime();
    if (delta !== 0) return delta;
    return (a.id ?? '').localeCompare(b.id ?? '');
  });

  const visits: Visit[] = sorted.map((event, index) => {
    const enteredLocal = localDate(instant(event.occurredAt), timeZone);
    const next = sorted[index + 1];
    const endLocal = next ? localDate(instant(next.occurredAt), timeZone) : today;
    const visit: Visit = {
      stage: event.stage,
      enteredLocal,
      days: daysBetween(enteredLocal, endLocal),
    };
    if (!next) visit.current = true;
    return visit;
  });

  const totals: Partial<Record<Stage, number>> = {};
  for (const visit of visits) {
    totals[visit.stage] = (totals[visit.stage] ?? 0) + visit.days;
  }

  return {
    currentStage: visits[visits.length - 1].stage,
    visits,
    totals,
  };
}

export function lastActivityAt(latestEventAt: Date, updatedAt: Date): Date {
  return latestEventAt.getTime() >= updatedAt.getTime() ? latestEventAt : updatedAt;
}
