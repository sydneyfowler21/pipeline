import { loadEnv, migrationDatabaseUrl } from '../env.js';
import { runMigrations } from './migrate.js';

const env = loadEnv();
await runMigrations(migrationDatabaseUrl(env));
console.info('migrations applied');
