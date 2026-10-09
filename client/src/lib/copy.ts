import { localDate, localDateTimeUtc, type Stage } from '@pipeline/shared';

export function screenshotRequested(mode: string, flag: string | null): boolean {
  return mode !== 'production' && flag === '1';
}

export function browserTimeZone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (zone) return zone;
  } catch {
    /* fall through */
  }
  return 'America/Denver';
}

export function daysPhrase(days: number, current = false): string {
  if (days <= 0) return 'Today';
  const noun = days === 1 ? '1 day' : `${days} days`;
  return current ? `${noun} so far` : noun;
}

export function formatInstant(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone,
  }).format(new Date(iso));
}

export function formatCalendarDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  if (!year || !month || !day) return isoDate;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function formatWhen(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  }).format(new Date(iso));
}

export function activityText(
  kind: 'stage_change' | 'edited',
  stage: string | null,
  at: string,
  timeZone: string,
): string {
  const date = formatInstant(at, timeZone);
  if (kind === 'edited') return `Notes edited · ${date}`;
  return `Moved to ${stage ?? 'stage'} · ${date}`;
}

export function noResultsCopy(query: string, stage: string | null): string {
  const q = query.trim();
  if (q && stage) return `No applications match “${q}” in ${stage}`;
  if (q) return `No applications match “${q}”`;
  if (stage) return `No applications match in ${stage}`;
  return 'No applications match';
}

export function initials(email: string): string {
  const local = email.split('@')[0] ?? '';
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase();
  }
  return (local.slice(0, 2) || 'ME').toUpperCase();
}

export function monogramLetter(company: string): string {
  const letter = company.trim().charAt(0).toUpperCase();
  return letter || '?';
}

export function toneIndex(company: string): number {
  let hash = 0;
  for (const char of company) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % 8;
}

export function noteCounter(length: number): {
  text: string;
  tone: 'muted' | 'warn' | 'danger';
} {
  if (length > 280) {
    const over = length - 280;
    return {
      text: `${over} ${over === 1 ? 'character' : 'characters'} over`,
      tone: 'danger',
    };
  }
  return { text: `${length} / 280`, tone: length >= 260 ? 'warn' : 'muted' };
}

export function todayInZone(timeZone: string, now = new Date()): string {
  return localDate(now, timeZone);
}

/** Omit the timestamp when the picked day is today so the server uses now. */
export function occurredAtForMove(input: {
  selectedDate: string;
  today: string;
  latestEventAt: string;
  latestEventLocalDate: string;
  timeZone: string;
  now: Date;
}): string | undefined {
  if (!input.selectedDate || input.selectedDate === input.today) return undefined;
  if (input.selectedDate <= input.latestEventLocalDate) return input.latestEventAt;
  const end = localDateTimeUtc(input.selectedDate, 23, 59, input.timeZone);
  if (end.getTime() <= new Date(input.latestEventAt).getTime()) return input.latestEventAt;
  if (end.getTime() > input.now.getTime()) return undefined;
  return end.toISOString();
}

export function friendlyError(body: { error?: string; message?: string } | null): string {
  const text = body?.error ?? body?.message ?? '';
  if (/future/i.test(text)) return "Can't be in the future.";
  if (/earlier/i.test(text)) return "Can't be before the last change.";
  if (text === 'Already in this stage') return 'Already in this stage';
  if (text === 'Email or password is incorrect') return 'Email or password is incorrect';
  if (text.includes("we've sent a link")) return "If that email can be used, we've sent a link.";
  if (text === 'Current password is incorrect') return 'Current password is incorrect.';
  if (text === 'Sign out here from the account menu.') return text;
  if (text.includes('breach')) return "Choose a password that isn't in known breach lists.";
  if (text.includes('Verify your email')) return 'Confirm your email to add applications.';
  if (text.includes('Demo accounts')) return "Demo accounts can't change their password.";
  if (text === 'Invalid or expired token') return 'This link is invalid or expired.';
  if (text === 'Too many requests') return 'Too many attempts. Wait a minute and try again.';
  if (text === 'Wait before requesting another link.') return text;
  if (text === 'Not found') return 'That could not be found.';
  return 'Something went wrong. Try again.';
}

export function hoursLeft(expiresAt: string, now = new Date()): string {
  const ms = new Date(expiresAt).getTime() - now.getTime();
  const hours = Math.max(1, Math.round(ms / 3_600_000));
  return hours === 1 ? '1 hour' : `${hours} hours`;
}

export function otherDeviceCount(sessionCount: number): number {
  return Math.max(0, sessionCount - 1);
}

export function passwordWarning(otherDevices: number): string {
  if (otherDevices === 1) {
    return 'Changing your password signs out your other 1 device. You stay signed in here.';
  }
  return `Changing your password signs out your other ${otherDevices} devices. You stay signed in here.`;
}

export const STAGES: Stage[] = ['Applied', 'Screen', 'Interview', 'Offer', 'Closed'];
