import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

export function migrationsFolder(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '../../drizzle');
}

export async function runMigrations(databaseUrl: string): Promise<void> {
  const sql = postgres(databaseUrl, { prepare: false, max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(sql), { migrationsFolder: migrationsFolder() });
  } finally {
    await sql.end({ timeout: 5 });
  }
}
