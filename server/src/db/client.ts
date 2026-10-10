import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

export function createDb(databaseUrl: string) {
  const sql = postgres(databaseUrl, {
    prepare: false,
    max: 10,
    onnotice: () => {},
  });
  const db = drizzle(sql, { schema });
  return { db, sql };
}

export type Database = ReturnType<typeof createDb>['db'];
