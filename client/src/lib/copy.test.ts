import { describe, expect, it } from 'vitest';
import {
  activityText,
  daysPhrase,
  friendlyError,
  noResultsCopy,
  noteCounter,
  occurredAtForMove,
  passwordWarning,
  screenshotRequested,
} from './copy';

describe('screen copy', () => {
  it('honors the screenshot flag only outside production', () => {
    expect(screenshotRequested('production', '1')).toBe(false);
    expect(screenshotRequested('development', '1')).toBe(true);
    expect(screenshotRequested('test', '1')).toBe(true);
    expect(screenshotRequested('development', null)).toBe(false);
  });

  it('phrases days, activity, and empty search the way the brief specifies', () => {
    expect(daysPhrase(0, true)).toBe('Today');
    expect(daysPhrase(1, false)).toBe('1 day');
    expect(daysPhrase(1, true)).toBe('1 day so far');
    expect(daysPhrase(19, false)).toBe('19 days');
    expect(
      activityText('stage_change', 'Interview', '2026-10-06T16:00:00Z', 'America/Denver'),
    ).toBe('Moved to Interview · Oct 6');
    expect(activityText('edited', null, '2026-10-08T15:00:00Z', 'America/Denver')).toBe(
      'Notes edited · Oct 8',
    );
    expect(noResultsCopy('acme', 'Offer')).toBe('No applications match “acme” in Offer');
    expect(noResultsCopy('acme', null)).toBe('No applications match “acme”');
    expect(noResultsCopy('', 'Screen')).toBe('No applications match in Screen');
  });

  it('warns on the stage-note counter and blocks a future move date', () => {
    expect(noteCounter(20)).toEqual({ text: '20 / 280', tone: 'muted' });
    expect(noteCounter(260).tone).toBe('warn');
    expect(noteCounter(281)).toEqual({ text: '1 character over', tone: 'danger' });
    expect(
      occurredAtForMove({
        selectedDate: '2026-10-09',
        today: '2026-10-09',
        latestEventAt: '2026-10-01T06:00:00.000Z',
        latestEventLocalDate: '2026-10-01',
        timeZone: 'America/Denver',
        now: new Date('2026-10-09T18:00:00Z'),
      }),
    ).toBeUndefined();
    expect(
      occurredAtForMove({
        selectedDate: '2026-10-01',
        today: '2026-10-09',
        latestEventAt: '2026-10-01T16:00:00.000Z',
        latestEventLocalDate: '2026-10-01',
        timeZone: 'America/Denver',
        now: new Date('2026-10-09T18:00:00Z'),
      }),
    ).toBe('2026-10-01T16:00:00.000Z');
  });

  it('keeps known server messages and hides raw failures', () => {
    expect(friendlyError({ error: 'Email or password is incorrect' })).toBe(
      'Email or password is incorrect',
    );
    expect(friendlyError({ error: 'occurred_at is in the future' })).toBe(
      "Can't be in the future.",
    );
    expect(friendlyError({ error: 'Internal error' })).toBe('Something went wrong. Try again.');
    expect(passwordWarning(2)).toContain('other 2 devices');
  });
});
