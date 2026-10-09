import { eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { rateLimits } from '../db/schema.js';

export const RATE = {
  signupIp: { max: 5, windowMs: 60 * 60 * 1000 },
  loginIp: { max: 30, windowMs: 15 * 60 * 1000 },
  loginAccountIp: { max: 30, windowMs: 15 * 60 * 1000 },
  loginAccount: { max: 10, windowMs: 15 * 60 * 1000 },
  resetIp: { max: 5, windowMs: 60 * 60 * 1000 },
  resetAccount: { max: 3, windowMs: 60 * 60 * 1000 },
  resetCheckIp: { max: 30, windowMs: 15 * 60 * 1000 },
  resetCheckPrefix: { max: 10, windowMs: 15 * 60 * 1000 },
  resetCheckGlobal: { max: 100, windowMs: 60 * 60 * 1000 },
  demoIp: { max: 10, windowMs: 60 * 60 * 1000 },
  passwordAccount: { max: 5, windowMs: 60 * 60 * 1000 },
  resendAccount: { max: 1, windowMs: 60 * 1000 },
} as const;

const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_BASE_SECONDS = 60;
const LOCKOUT_CAP_SECONDS = 60 * 60;

/** 5 failures → 60s, then double, capped at 1 hour. */
export function lockoutSeconds(failureCount: number): number | null {
  if (failureCount < LOCKOUT_THRESHOLD) return null;
  const seconds = LOCKOUT_BASE_SECONDS * 2 ** (failureCount - LOCKOUT_THRESHOLD);
  return Math.min(seconds, LOCKOUT_CAP_SECONDS);
}

export async function consumeRateLimit(
  db: Database,
  key: string,
  max: number,
  windowMs: number,
  now: Date,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(rateLimits)
      .where(eq(rateLimits.key, key))
      .for('update');
    const row = existing[0];
    if (!row || now.getTime() - row.windowStart.getTime() >= windowMs) {
      if (!row) {
        await tx.insert(rateLimits).values({
          key,
          windowStart: now,
          count: 1,
          lockedUntil: null,
        });
      } else {
        await tx
          .update(rateLimits)
          .set({ windowStart: now, count: 1 })
          .where(eq(rateLimits.key, key));
      }
      return true;
    }
    const count = row.count + 1;
    await tx.update(rateLimits).set({ count }).where(eq(rateLimits.key, key));
    return count <= max;
  });
}

function lockKey(userId: string): string {
  return `login-lock:${userId}`;
}

export async function loginLock(
  db: Database,
  userId: string,
): Promise<{ count: number; lockedUntil: Date | null }> {
  const rows = await db
    .select()
    .from(rateLimits)
    .where(eq(rateLimits.key, lockKey(userId)));
  if (!rows[0]) return { count: 0, lockedUntil: null };
  return { count: rows[0].count, lockedUntil: rows[0].lockedUntil };
}

export async function recordLoginFailure(
  db: Database,
  userId: string,
  now: Date,
): Promise<{ count: number; lockedUntil: Date | null }> {
  const key = lockKey(userId);
  return db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(rateLimits)
      .where(eq(rateLimits.key, key))
      .for('update');
    const count = (existing[0]?.count ?? 0) + 1;
    const seconds = lockoutSeconds(count);
    const lockedUntil = seconds == null ? null : new Date(now.getTime() + seconds * 1000);
    if (!existing[0]) {
      await tx.insert(rateLimits).values({
        key,
        windowStart: now,
        count,
        lockedUntil,
      });
    } else {
      await tx
        .update(rateLimits)
        .set({ count, windowStart: now, lockedUntil })
        .where(eq(rateLimits.key, key));
    }
    return { count, lockedUntil };
  });
}

export async function retryAfterSeconds(
  db: Database,
  key: string,
  windowMs: number,
  now: Date,
): Promise<number> {
  const rows = await db.select().from(rateLimits).where(eq(rateLimits.key, key));
  const start = rows[0]?.windowStart.getTime() ?? now.getTime();
  return Math.max(1, Math.ceil((windowMs - (now.getTime() - start)) / 1000));
}

export async function clearLoginFailures(db: Database, userId: string): Promise<void> {
  await db
    .update(rateLimits)
    .set({ count: 0, lockedUntil: null })
    .where(eq(rateLimits.key, lockKey(userId)));
}
