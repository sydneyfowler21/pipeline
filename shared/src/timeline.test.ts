import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { computeTimeline, noonUtc } from './index.js';
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

describe('noonUtc', () => {
  it('is 18:00Z for a summer date in America/Denver', () => {
    expect(noonUtc('2026-08-03', 'America/Denver').toISOString()).toBe('2026-08-03T18:00:00.000Z');
  });

  it('is 19:00Z after Denver leaves daylight saving time', () => {
    expect(noonUtc('2026-12-01', 'America/Denver').toISOString()).toBe('2026-12-01T19:00:00.000Z');
  });
});
