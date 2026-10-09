import {
  boolean,
  customType,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const citext = customType<{ data: string }>({
  dataType() {
    return 'citext';
  },
});

export const stageEnum = pgEnum('stage', ['Applied', 'Screen', 'Interview', 'Offer', 'Closed']);

export const authTokenKindEnum = pgEnum('auth_token_kind', ['verify_email', 'reset_password']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  email: citext('email').notNull().unique(),
  passwordHash: text('password_hash'),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true, mode: 'date' }),
  timeZone: text('time_zone').notNull().default('America/Denver'),
  isDemo: boolean('is_demo').notNull().default(false),
  demoExpiresAt: timestamp('demo_expires_at', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const applications = pgTable(
  'applications',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    company: text('company').notNull(),
    role: text('role').notNull(),
    url: text('url'),
    notes: text('notes').notNull().default(''),
    appliedOn: date('applied_on', { mode: 'string' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [index('applications_user_updated_idx').on(table.userId, table.updatedAt)],
);

export const stageEvents = pgTable(
  'stage_events',
  {
    id: uuid('id').primaryKey(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id, { onDelete: 'cascade' }),
    stage: stageEnum('stage').notNull(),
    note: text('note'),
    occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'date' }).notNull(),
  },
  (table) => [index('stage_events_app_occurred_idx').on(table.applicationId, table.occurredAt)],
);

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true, mode: 'date' }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    ip: text('ip'),
    userAgent: text('user_agent'),
    mfaPassed: boolean('mfa_passed').notNull().default(false),
  },
  (table) => [index('sessions_user_idx').on(table.userId)],
);

export const authTokens = pgTable(
  'auth_tokens',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: authTokenKindEnum('kind').notNull(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [index('auth_tokens_hash_idx').on(table.tokenHash)],
);

export const authEvents = pgTable(
  'auth_events',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    ip: text('ip'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [index('auth_events_user_created_idx').on(table.userId, table.createdAt)],
);

export const rateLimits = pgTable('rate_limits', {
  key: text('key').primaryKey(),
  windowStart: timestamp('window_start', { withTimezone: true, mode: 'date' }).notNull(),
  count: integer('count').notNull(),
  lockedUntil: timestamp('locked_until', { withTimezone: true, mode: 'date' }),
});

export const IDLE_MS = 7 * 24 * 60 * 60 * 1000;
export const ABSOLUTE_MS = 30 * 24 * 60 * 60 * 1000;
export const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
export const RESET_TTL_MS = 30 * 60 * 1000;
export const DEMO_TTL_MS = 24 * 60 * 60 * 1000;

export const AUTH_EVENT = {
  signIn: 'sign_in',
  signInFailure: 'sign_in_failure',
  signOut: 'sign_out',
  signOutAll: 'sign_out_all',
  passwordReset: 'password_reset',
  emailVerified: 'email_verified',
  passwordChange: 'password_change',
  sessionRevoked: 'session_revoked',
} as const;
