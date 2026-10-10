import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

/**
 * Arbitrary key for pg_advisory_xact_lock. The pair is app-specific and stable.
 * Two-int form avoids bigint parameter casts.
 */
const MIGRATION_LOCK = [814261, 1] as const;

export function migrationsFolder(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '../../drizzle');
}

/**
 * Applies committed Drizzle migrations before the server listens.
 *
 * drizzle-orm 0.45 `migrate()` succeeds on a Neon pooled URL (PgBouncer,
 * transaction mode) when the client sets `prepare: false`. This schema is
 * ordinary DDL in one transaction, and that migrator does not take a lock of
 * its own. A second overlapping run can lose the `CREATE SCHEMA` race.
 *
 * A session-level `pg_advisory_lock` does not fix that on the pooler: the
 * backend is returned between statements, so the lock and the following
 * statement can land on different sessions (and unlock can miss). Holding
 * `pg_advisory_xact_lock` for this whole transaction does exclude other
 * migrators, because PgBouncer pins the backend until commit. The bookkeeping
 * read is inside the same transaction, matching the rows `migrate()` writes
 * to `drizzle.__drizzle_migrations`.
 *
 * `databaseUrl` may be the pooled `DATABASE_URL` or a direct Neon URL.
 */
export async function runMigrations(databaseUrl: string): Promise<void> {
  const client = postgres(databaseUrl, { prepare: false, max: 1, onnotice: () => {} });
  const db = drizzle(client);
  const migrations = readMigrationFiles({ migrationsFolder: migrationsFolder() });
  const schema = sql.identifier('drizzle');
  const table = sql.identifier('__drizzle_migrations');
  try {
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(${MIGRATION_LOCK[0]}, ${MIGRATION_LOCK[1]})`,
      );
      await tx.execute(sql`CREATE SCHEMA IF NOT EXISTS ${schema}`);
      await tx.execute(sql`
        CREATE TABLE IF NOT EXISTS ${schema}.${table} (
          id SERIAL PRIMARY KEY,
          hash text NOT NULL,
          created_at bigint
        )
      `);
      const existing = await tx.execute<{ created_at: string | number }>(
        sql`select created_at from ${schema}.${table} order by created_at desc limit 1`,
      );
      const createdAt = existing[0]?.created_at;
      const last = createdAt === undefined ? undefined : Number(createdAt);
      for (const migration of migrations) {
        if (last !== undefined && last >= migration.folderMillis) continue;
        for (const statement of migration.sql) {
          await tx.execute(sql.raw(statement));
        }
        await tx.execute(
          sql`insert into ${schema}.${table} ("hash", "created_at") values(${migration.hash}, ${migration.folderMillis})`,
        );
      }
    });
  } finally {
    await client.end({ timeout: 5 });
  }
}
