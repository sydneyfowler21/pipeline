import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { authTokens, sessions, users } from '../db/schema.js';

/**
 * Kinds cleared when a password is set. `change_email` and `email_change` are included
 * so a future enum value is expired without a second code path. They are not issued today.
 */
const CREDENTIAL_TOKEN_KINDS = ['reset_password', 'change_email', 'email_change'] as const;

/**
 * Set a password, expire outstanding reset and email-change tokens, and delete sessions.
 * One transaction. Returns false when `requiredTokenId` was already used.
 */
export async function replacePassword(
  db: Database,
  input: { userId: string; passwordHash: string; now: Date; requiredTokenId?: string },
): Promise<boolean> {
  return db.transaction(async (tx) => {
    if (input.requiredTokenId) {
      const consumed = await tx
        .update(authTokens)
        .set({ usedAt: input.now })
        .where(and(eq(authTokens.id, input.requiredTokenId), isNull(authTokens.usedAt)))
        .returning({ id: authTokens.id });
      if (consumed.length === 0) return false;
    }

    await tx
      .update(users)
      .set({ passwordHash: input.passwordHash })
      .where(eq(users.id, input.userId));

    await tx
      .update(authTokens)
      .set({ usedAt: input.now })
      .where(
        and(
          eq(authTokens.userId, input.userId),
          isNull(authTokens.usedAt),
          sql`${authTokens.kind}::text IN (${sql.join(
            CREDENTIAL_TOKEN_KINDS.map((kind) => sql`${kind}`),
            sql`, `,
          )})`,
        ),
      );

    await tx.delete(sessions).where(eq(sessions.userId, input.userId));
    return true;
  });
}
