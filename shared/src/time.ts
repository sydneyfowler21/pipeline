const partFormatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let fmt = partFormatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    partFormatters.set(timeZone, fmt);
  }
  return fmt;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    formatter(timeZone);
    return true;
  } catch {
    partFormatters.delete(timeZone);
    return false;
  }
}

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const parts = formatter(timeZone).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  let hour = read('hour');
  // Some ICU builds report midnight as 24.
  if (hour === 24) hour = 0;
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour,
    minute: read('minute'),
    second: read('second'),
  };
}

/** Calendar date YYYY-MM-DD in an IANA time zone. */
export function localDate(instant: Date, timeZone: string): string {
  const parts = zonedParts(instant, timeZone);
  const month = String(parts.month).padStart(2, '0');
  const day = String(parts.day).padStart(2, '0');
  return `${parts.year}-${month}-${day}`;
}

export function daysBetween(startDate: string, endDate: string): number {
  const [sy, sm, sd] = startDate.split('-').map(Number);
  const [ey, em, ed] = endDate.split('-').map(Number);
  const start = Date.UTC(sy, sm - 1, sd);
  const end = Date.UTC(ey, em - 1, ed);
  return Math.round((end - start) / 86_400_000);
}

/**
 * UTC instant for 00:00:00 on a calendar date in `timeZone`.
 * Past Applied events use this so a later move at "now" is not before them.
 */
export function localMidnightUtc(isoDate: string, timeZone: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) throw new Error('localMidnightUtc expects YYYY-MM-DD');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  let utc = Date.UTC(year, month - 1, day, 0, 0, 0);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const local = zonedParts(new Date(utc), timeZone);
    const desired = Date.UTC(year, month - 1, day, 0, 0, 0);
    const actual = Date.UTC(
      local.year,
      local.month - 1,
      local.day,
      local.hour,
      local.minute,
      local.second,
    );
    const diff = desired - actual;
    utc += diff;
    if (diff === 0) break;
  }
  return new Date(utc);
}

/**
 * Applied occurred_at: local midnight on applied_on, or createdAt when applied_on is
 * today in the user's time zone. The second case keeps a default "now" stage move legal.
 */
export function appliedOccurredAt(appliedOn: string, timeZone: string, createdAt: Date): Date {
  if (appliedOn === localDate(createdAt, timeZone)) return createdAt;
  return localMidnightUtc(appliedOn, timeZone);
}
