import { loadEnv } from '../env.js';
import { runMigrations } from './migrate.js';

const env = loadEnv();
await runMigrations(env.DATABASE_URL);
console.info('migrations applied');
