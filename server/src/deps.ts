import type { Clock } from './clock.js';
import type { Database } from './db/client.js';
import type { Env } from './env.js';
import type { HibpResult } from './auth/hibp.js';
import type { MailTransport } from './mail/transport.js';

export type AppDeps = {
  db: Database;
  mail: MailTransport;
  clock: Clock;
  env: Env;
  hibp: (password: string) => Promise<HibpResult>;
};

export type SessionUser = {
  id: string;
  email: string;
  passwordHash: string | null;
  emailVerifiedAt: Date | null;
  timeZone: string;
  isDemo: boolean;
  demoExpiresAt: Date | null;
  createdAt: Date;
};

export type AppVariables = {
  user: SessionUser | null;
  sessionId: string | null;
};

export type AppEnv = { Variables: AppVariables };
