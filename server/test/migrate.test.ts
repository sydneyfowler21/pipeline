import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { runMigrations } from '../src/db/migrate.js';

const databaseName = 'pipeline_migrate_lock';

describe('startup migrations', () => {
  let admin: postgres.Sql;
  let url: string;

  beforeAll(async () => {
    const base = process.env.DATABASE_URL;
    if (!base) throw new Error('DATABASE_URL is required');
    admin = postgres(base, { prepare: false, max: 1, onnotice: () => {} });
    await resetDatabase();
    await admin.unsafe(`create database ${databaseName}`);
    const parsed = new URL(base);
    parsed.pathname = `/${databaseName}`;
    url = parsed.toString();
  });

  afterAll(async () => {
    await resetDatabase();
    await admin.end({ timeout: 5 });
  });

  it('applies once when two migrators race, then again with no extra row', async () => {
    await Promise.all([runMigrations(url), runMigrations(url)]);
    await runMigrations(url);
    const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
    try {
      const rows = await sql`select count(*)::int as n from drizzle.__drizzle_migrations`;
      expect(rows[0]?.n).toBe(1);
      const users = await sql`select to_regclass('public.users') as name`;
      expect(users[0]?.name).toBe('users');
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  async function resetDatabase(): Promise<void> {
    await admin.unsafe(
      `select pg_terminate_backend(pid) from pg_stat_activity where datname = '${databaseName}' and pid <> pg_backend_pid()`,
    );
    await admin.unsafe(`drop database if exists ${databaseName}`);
  }
});
