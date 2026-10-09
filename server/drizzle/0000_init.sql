CREATE EXTENSION IF NOT EXISTS citext;
--> statement-breakpoint
CREATE TYPE stage AS ENUM ('Applied', 'Screen', 'Interview', 'Offer', 'Closed');
--> statement-breakpoint
CREATE TYPE auth_token_kind AS ENUM ('verify_email', 'reset_password');
--> statement-breakpoint
CREATE TABLE users (
  id uuid PRIMARY KEY,
  email citext NOT NULL UNIQUE,
  password_hash text,
  email_verified_at timestamptz,
  time_zone text NOT NULL DEFAULT 'America/Denver',
  is_demo boolean NOT NULL DEFAULT false,
  demo_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE applications (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  company text NOT NULL,
  role text NOT NULL,
  url text,
  notes text NOT NULL DEFAULT '',
  applied_on date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX applications_user_updated_idx ON applications (user_id, updated_at);
--> statement-breakpoint
CREATE TABLE stage_events (
  id uuid PRIMARY KEY,
  application_id uuid NOT NULL REFERENCES applications (id) ON DELETE CASCADE,
  stage stage NOT NULL,
  note text,
  occurred_at timestamptz NOT NULL
);
--> statement-breakpoint
CREATE INDEX stage_events_app_occurred_idx ON stage_events (application_id, occurred_at);
--> statement-breakpoint
-- Current stage is the latest stage_events row. There is no status column.
-- UPDATE is always rejected. DELETE is rejected unless it is the FK cascade from applications
-- (that path runs inside the internal RI trigger, so pg_trigger_depth() > 1).
CREATE OR REPLACE FUNCTION stage_events_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'stage_events are append-only' USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF pg_trigger_depth() < 2 THEN
      RAISE EXCEPTION 'stage_events are append-only' USING ERRCODE = '55000';
    END IF;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER stage_events_append_only
  BEFORE UPDATE OR DELETE ON stage_events
  FOR EACH ROW
  EXECUTE FUNCTION stage_events_append_only();
--> statement-breakpoint
REVOKE UPDATE ON stage_events FROM PUBLIC;
--> statement-breakpoint
CREATE TABLE sessions (
  id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  ip text,
  user_agent text,
  mfa_passed boolean NOT NULL DEFAULT false
);
--> statement-breakpoint
CREATE INDEX sessions_user_idx ON sessions (user_id);
--> statement-breakpoint
CREATE TABLE auth_tokens (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind auth_token_kind NOT NULL,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);
--> statement-breakpoint
CREATE INDEX auth_tokens_hash_idx ON auth_tokens (token_hash);
--> statement-breakpoint
CREATE TABLE auth_events (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES users (id) ON DELETE CASCADE,
  kind text NOT NULL,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX auth_events_user_created_idx ON auth_events (user_id, created_at DESC);
--> statement-breakpoint
CREATE TABLE rate_limits (
  key text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  count integer NOT NULL,
  locked_until timestamptz
);
