# pipeline — SPEC

Job-search pipeline with stage history, not overwritten status.
A public portfolio app: a stranger signs in, adds a job application, moves it through
stages, and sees how long each stage lasted. Audience: a hiring manager skimming a GitHub pin.
That is the whole product. **The repo wins:** if this file and code disagree, fix one in the same PR.

## Stack (locked)
- Client: React 18 + TypeScript, Vite, Tailwind CSS, shadcn/ui, TanStack Query, React Router.
- API: Node 22 + TypeScript, Hono (`@hono/node-server`), zod validation.
- DB: Postgres on Neon (pooled URL), Drizzle ORM + drizzle-kit migrations.
- Auth libs: `@node-rs/argon2` (argon2id), `otplib` (TOTP, slice 2), `arctic` (GitHub OAuth, slice 2).
- Email: Resend. Dev/test uses an in-memory mail sink.
- Tests: vitest (unit + API against a real Postgres), Playwright (e2e).
- CI: GitHub Actions on every push and PR (typecheck, lint, vitest, Playwright, gitleaks, `npm audit --omit=dev`).
- Deploy: one Render web service (API serves the built client) + Neon. Config in `render.yaml`.
- Secrets only in env vars (`DATABASE_URL`, `SESSION_SECRET`, `ENCRYPTION_KEY`, `RESEND_API_KEY`,
  `GITHUB_CLIENT_ID/SECRET`, `APP_URL`). Never in code, logs, or responses.

## Data model
All ids are UUIDv7. Timestamps are `timestamptz` (UTC). Dates are `date`.

- `users`: id, email (citext, unique), password_hash (nullable for OAuth-only), email_verified_at,
  time_zone (IANA, default `America/Denver`), is_demo, demo_expires_at, created_at.
- `applications`: id, user_id → users (cascade), company, role, url, notes, applied_on (date),
  created_at, updated_at. Index (user_id, updated_at).
- `stage_events`: id, application_id → applications (cascade), stage (enum), note, occurred_at.
  Index (application_id, occurred_at). **No UPDATE or DELETE** except via application cascade.
- `sessions`: id (hash of token), user_id, created_at, last_seen_at, expires_at, ip, user_agent, mfa_passed.
- `auth_tokens`: id, user_id, kind (`verify_email` | `reset_password`), token_hash, expires_at, used_at.
- `totp_credentials` (slice 2): user_id, secret_encrypted (AES-256-GCM with `ENCRYPTION_KEY`), enabled_at.
- `recovery_codes` (slice 2): id, user_id, code_hash, used_at.
- `oauth_accounts` (slice 2): provider, provider_user_id, user_id. Unique (provider, provider_user_id).
- `auth_events`: id, user_id (nullable), kind, ip, user_agent, created_at.
- `rate_limits`: key, window_start, count, locked_until.

There is **no status column**. Current stage = stage of the latest `stage_events` row
(order by occurred_at desc, id desc).

## Stages and history rules
1. Stage enum: `Applied, Screen, Interview, Offer, Closed`. Not user-defined.
2. Any stage may move to any other stage, including earlier ones (a revisit). Closed can reopen.
   Moving to the current stage is rejected (409, "Already in this stage").
3. Stage changes always append. Events are never edited or deleted; a correction is a new event.
4. Creating an application writes an `Applied` event in the same transaction. occurred_at is
   00:00 in the user's time zone on applied_on, except when applied_on is today in that time zone,
   in which case occurred_at is the application's created_at. A stage move immediately afterward,
   using the default of now, is therefore not earlier than the Applied event.
5. A stage change takes optional `occurred_at`: default now; rejected if in the future;
   rejected if earlier than the latest existing event (equal is allowed).
6. DB enforcement: a trigger rejects UPDATE on `stage_events`, and rejects DELETE unless the parent
   application is being deleted in the same statement (FK cascade). The app role has no UPDATE grant.

## Days in stage
- Convert each occurred_at to a calendar date in the user's time zone.
- A visit lasts `next_event_local_date − this_event_local_date` days. The current visit counts to
  today's local date.
- A revisited stage shows each visit separately plus a total per stage.
- Pure function `computeTimeline(events, timeZone, today)` in `shared/`; unit-tested against the fixture.

## Applications
- Create: company, role required (1–120 chars); url optional (http/https only); notes ≤ 5,000 chars;
  applied_on required, not in the future.
- Edit: company, role, url, notes. Bumps updated_at. applied_on is not editable after creation.
- Delete: cascades to stage_events. Confirm dialog.
- **Notes:** the application note is the running summary; the optional stage-event note says what changed.

## Views
- **List**: sorted by last activity = greatest(latest event occurred_at, applications.updated_at), desc.
  Shows company, role, current stage badge, days in current stage, last activity.
- **Detail**: application fields, "Move to stage" control (stage, optional date, optional note),
  timeline (stage, entered-at, days-in-stage, note) and per-stage totals.
- Every list and save has empty, loading, and error states. Save failures keep the form input.
- Usability baseline: visible hover/pressed/focus states, pointer cursor on clickables,
  WCAG AA contrast, no-results message, wraps cleanly at 390, 768 and 1280px.

## Auth (properly sophisticated)
- **Passwords**: argon2id (m=19456 KiB, t=2, p=1); min length 12, max 128; rejected if found in
  HIBP via the k-anonymity range API (send only the first 5 SHA-1 hex chars; fail open with a log line
  if HIBP is down).
- **Email verification** on sign-up. Unverified users can sign in but can't create applications.
- **Password reset** by email: 32-byte random token, stored as SHA-256 hash, single use, 30-minute
  expiry. Reset revokes all sessions.
- **Sessions**: server-side in Postgres; cookie `__Host-sid`, httpOnly, Secure, SameSite=Lax, Path=/.
  Idle timeout 7 days, absolute 30 days. Rotate session id on login, password change, 2FA change.
  "Sign out of all devices" deletes every session for the user. Session list shown in Settings.
- **CSRF**: double-submit token header (`X-CSRF-Token`) on all non-GET requests, plus Origin check.
- **2FA (slice 2)**: optional TOTP, secret encrypted at rest; 10 recovery codes, argon2id-hashed, single use.
- **Sign in with GitHub (slice 2)**: OAuth with state + PKCE; links to an existing account only when
  GitHub returns a verified primary email matching a verified local email.
- **Abuse**: rate limits per IP and per account on login, sign-up, reset request, and 2FA.
  Progressive lockout on login: 5 failures → 1 min, then doubling to a 1-hour cap.
- **No user enumeration**: login says "Email or password is incorrect"; reset and sign-up always say
  "If that email can be used, we've sent a link."
- **Audit log**: sign-in, sign-in failure, sign-out, sign-out-all, password reset, email verified,
  2FA enabled/disabled, recovery code used. Users see their last 50 in Settings.

## Platform security
- Headers: strict CSP (`default-src 'self'`; no inline script), HSTS, X-Content-Type-Options,
  Referrer-Policy strict-origin-when-cross-origin, frame-ancestors 'none'.
- Every query is scoped by `user_id` server-side. Another user's id returns **404**, never 403.
- Request body limit 64 KB. All inputs validated with zod. No secrets or tokens in logs.

## Demo
- Open sign-up, plus a **Try the demo** button: creates a throwaway verified user (`is_demo`),
  seeds fictional applications, signs in, and expires 24h later.
- An hourly job deletes expired demo users (cascade). Demo users can't change email or password.
- Fictional companies only (Acme Robotics, Northwind Labs, Globex, Initech, Hooli). No real data.

## Out of scope
Contacts, files, email sync, reminders, sharing, tags, salary, mobile app, billing, AI features.

## README (author's first-person voice)
- One-sentence description, screenshot, live URL, local run steps, stack.
- "I made history append-only so days-in-stage stays honest when a stage is revisited."
- "I made stages a fixed enum, not user-defined, so the demo stays small."
- "Notes live on the application and optionally on a stage event: the event note is what changed,
  the application note is the running summary."

## Acceptance
1. New account → create application → move to Screen, then Interview → reload → timeline shows both
   with durations (Playwright).
2. A second user can't read, edit, move or delete the first user's rows; their list shows only their own.
3. Tests cover: history append (no update/delete), days-in-stage across a revisit, cross-user isolation.
   All driven by `fixtures/slice-1.json`.
4. CI runs the tests on push and PR and must be green to merge.
