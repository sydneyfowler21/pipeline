import { eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { users } from '../db/schema.js';
import type { SessionUser } from '../deps.js';
import { normalizeEmail } from '../crypto.js';

export function toSessionUser(row: typeof users.$inferSelect): SessionUser {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    emailVerifiedAt: row.emailVerifiedAt,
    timeZone: row.timeZone,
    isDemo: row.isDemo,
    demoExpiresAt: row.demoExpiresAt,
    createdAt: row.createdAt,
  };
}

export function presentUser(user: SessionUser) {
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerifiedAt != null,
    timeZone: user.timeZone,
    isDemo: user.isDemo,
    demoExpiresAt: user.demoExpiresAt ? user.demoExpiresAt.toISOString() : null,
  };
}

export async function findUserByEmail(db: Database, email: string): Promise<SessionUser | null> {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizeEmail(email)));
  const row = rows[0];
  return row ? toSessionUser(row) : null;
}

export async function findUserById(db: Database, id: string): Promise<SessionUser | null> {
  const rows = await db.select().from(users).where(eq(users.id, id));
  const row = rows[0];
  return row ? toSessionUser(row) : null;
}
