import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { appliedOccurredAt, computeTimeline, localMidnightUtc } from './index.js';
import type { Stage } from './stages.js';

type FixtureEvent = {
  stage: Stage;
  occurred_at: string;
  note: string | null;
};

type FixtureVisit = {
  stage: Stage;
  enteredLocal: string;
  days: number;
  current?: boolean;
};

type FixtureApp = {
  key: string;
  events: FixtureEvent[];
  expected: {
    currentStage: Stage;
    visits: FixtureVisit[];
    totals: Partial<Record<Stage, number>>;
  };
};

type Fixture = {
  timeZone: string;
  today: string;
  applications: FixtureApp[];
};

const fixture = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../fixtures/slice-1.json', import.meta.url)), 'utf8'),
) as Fixture;

describe('computeTimeline', () => {
  it.each(fixture.applications.map((app) => [app.key, app] as const))(
    '%s matches the fixture, including a Denver date that differs from UTC',
    (_key, app) => {
      const timeline = computeTimeline(
        app.events.map((event, index) => ({
          id: `${app.key}-${index}`,
          stage: event.stage,
          occurredAt: event.occurred_at,
        })),
        fixture.timeZone,
        fixture.today,
      );

      expect(timeline.currentStage).toBe(app.expected.currentStage);
      expect(timeline.visits).toEqual(app.expected.visits);
      expect(timeline.totals).toEqual(app.expected.totals);
    },
  );

  it('puts the late-evening UTC interview on the previous Denver calendar date', () => {
    const acme = fixture.applications.find((app) => app.key === 'A1');
    if (!acme) throw new Error('missing A1');
    const timeline = computeTimeline(
      acme.events.map((event) => ({ stage: event.stage, occurredAt: event.occurred_at })),
      'America/Denver',
      '2026-10-09',
    );
    const revisit = timeline.visits[4];
    expect(revisit).toMatchObject({
      stage: 'Interview',
      enteredLocal: '2026-08-31',
      days: 14,
    });
  });
});

describe('localMidnightUtc', () => {
  it('is 06:00Z for a summer date in America/Denver', () => {
    expect(localMidnightUtc('2026-08-03', 'America/Denver').toISOString()).toBe(
      '2026-08-03T06:00:00.000Z',
    );
  });

  it('is 07:00Z after Denver leaves daylight saving time', () => {
    expect(localMidnightUtc('2026-12-01', 'America/Denver').toISOString()).toBe(
      '2026-12-01T07:00:00.000Z',
    );
  });
});

describe('appliedOccurredAt', () => {
  it('uses local midnight for a past applied_on and createdAt when applied_on is today', () => {
    const morning = new Date('2026-10-09T14:00:00.000Z');
    expect(appliedOccurredAt('2026-08-03', 'America/Denver', morning).toISOString()).toBe(
      '2026-08-03T06:00:00.000Z',
    );
    expect(appliedOccurredAt('2026-10-09', 'America/Denver', morning)).toBe(morning);
  });
});
