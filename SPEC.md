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
- **Notes:** the application note is the running summary (≤ 5,000 characters); the optional stage-event note says what changed and is at most 280 characters. Over 280 returns 422 `{ field: "note", message }`.

## Views
- **List**: sorted by last activity = greatest(latest event occurred_at, applications.updated_at), desc.
  Shows company, role, current stage badge, days in current stage, last activity.
  `GET /api/applications?q=&stage=` filters in the API. `q` matches company or role only
  (case-insensitive, trimmed, at most 100 characters), never notes. `stage` is one enum value.
  The response keeps the `applications` array and adds `total` (matches for `q`, before the stage
  filter), `countsByStage` for that search, and `unfilteredTotal`. Each item keeps `lastActivity`
  and adds `lastActivityAt`, `lastActivityKind` (`stage_change` or `edited`), and `lastActivityStage`.
  `edited` means `updated_at` is later than both `created_at` and the latest event.
- **Detail**: application fields, "Move to stage" control (stage, optional date, optional note),
  timeline (stage, entered-at, days-in-stage, note, visit number) and per-stage totals.
  The detail adds `visitCounts`, `latestEventAt`, `latestEventLocalDate`, `timeZone`, and `today`.
  Existing `totals` stay day counts only.
- **Settings**: Security (sessions, password, sign-in history) and Preferences (time zone).
- Every list and save has empty, loading, and error states. Save failures keep the form input.
- Usability baseline: visible hover/pressed/focus states, pointer cursor on clickables,
  WCAG AA contrast, no-results message, wraps cleanly at 390, 768 and 1280px.

## Auth (properly sophisticated)
- **Passwords**: argon2id (m=19456 KiB, t=2, p=1); min length 12, max 128; rejected if found in
  HIBP via the k-anonymity range API (send only the first 5 SHA-1 hex chars; fail open with a log line
  if HIBP is down).
- **Email verification** on sign-up. Unverified users can sign in but can't create applications.
- **Password reset** by email: 32-byte random token, stored as SHA-256 hash, single use, 30-minute
  expiry. Reset revokes all sessions. Any password change (reset completion or a signed-in password
  change, including `POST /api/me/password`) expires every outstanding reset token, and any
  email-change token if that kind exists, in the same transaction as the password update and the
  session revoke. A token from before that change is rejected on both `GET` and `POST
  /api/auth/reset-password` with the same generic invalid response as a missing token.
- **Sessions**: server-side in Postgres; cookie `__Host-sid`, httpOnly, Secure, SameSite=Lax, Path=/.
  Idle timeout 7 days, absolute 30 days. Rotate session id on login, password change, 2FA change.
  "Sign out of all devices" deletes every session for the user (`POST /api/auth/logout-all`, also
  `POST /api/sessions/revoke-all`). Session list shown in Settings with a parsed device label and IP.
  `DELETE /api/auth/sessions/:id` (and `DELETE /api/sessions/:id`) revokes one other session and writes
  `session_revoked`. The current session is refused with 409. Sign out here uses `POST /api/auth/logout`.
- **CSRF**: double-submit token header (`X-CSRF-Token`) on all non-GET requests, plus Origin check.
- **2FA (slice 2)**: optional TOTP, secret encrypted at rest; 10 recovery codes, argon2id-hashed, single use.
- **Sign in with GitHub (slice 2)**: OAuth with state + PKCE; links to an existing account only when
  GitHub returns a verified primary email matching a verified local email.
- **Abuse**: rate limits per IP and per account on login, sign-up, reset request, and 2FA.
  Login is also limited per account plus trusted IP. The per-account login limit does not include
  the IP, so a new address does not refresh that budget.
  `GET /api/auth/reset-password` uses the same limiter and the same 429 body as the other auth
  routes: trusted IP (30 per 15 minutes), plus a token-hash prefix (10 per 15 minutes) and a global
  cap (100 per hour). Over the limit the body is `{"error":"Too many requests"}` for every token.
  A missing, used, expired, or revoked token is 400 `{"error":"Invalid or expired token"}` on both
  GET and POST.
  Progressive lockout on login: 5 failures → 1 min, then doubling to a 1-hour cap.
  Lockout responses are deliberately generic for no-enumeration. A locked account, a wrong password,
  and an unknown email are the same 401, with body "Email or password is incorrect." and no
  `retryAfterSeconds`. Unknown emails still run argon2id against a dummy hash so the timing stays
  comparable. When a lock starts, email the owner once: not again on later attempts during that
  lock, and again only when a new lock starts. The mail says the account was temporarily locked,
  the unlock time in the user's time zone, a reset-password link, and the IP and device from the
  trusted-hop client address. Unknown emails get no mail.
  The sign-in screen (the client, not this API) may, after a few failed attempts, show one hint
  that is identical for every email: "Having trouble? Reset your password, or check your email."
- **No user enumeration**: login says "Email or password is incorrect."; reset and sign-up always say
  "If that email can be used, we've sent a link."
- **Audit log**: sign-in, sign-in failure, sign-out, sign-out-all, password reset, email verified,
  password changed (`password_change`), signed out a device (`session_revoked`),
  2FA enabled/disabled, recovery code used. Users see their last 50 in Settings, with a display label
  and parsed device. Changing a password verifies the current password (failures count toward the
  login lockout), applies the same length and breach rules, rejects a new password equal to the
  current one, deletes every other session, rotates this session, and is refused for demo users (403).
  `POST /api/auth/change-password` and `POST /api/me/password` are the same action.
- **Time zone**: sign-up and Try the demo accept an IANA `timeZone` (invalid or missing demo zones
  fall back to America/Denver; invalid sign-up zones are still rejected). `PATCH /api/me/preferences`
  updates it, including for demo users. Changing it re-counts days; it does not rewrite history.
- **Resend verification**: `POST /api/auth/resend-verification` sends another link and returns
  `retryAfterSeconds`. A second request inside the window is 429 with `retryAfterSeconds`.

## Platform security
- **Client IP**: `TRUSTED_PROXY_HOPS` entries from the right of `X-Forwarded-For`, because each
  trusted proxy appends the peer it saw. `0` ignores the header and uses the socket address. Unset
  defaults to `0`. Set `1` on Render, correct only because Render's proxy is the sole route to the
  app. A wrong hop count reopens IP spoofing. Invalid or negative values fail startup. If the header
  has fewer entries, or the chosen value is not an IP, use the socket address. Rate limits, sessions,
  `auth_events`, and demo seeding all use this one helper. Do not trust the leftmost hop.
- Headers: strict CSP (`default-src 'self'`; no inline script), HSTS, X-Content-Type-Options,
  Referrer-Policy strict-origin-when-cross-origin, frame-ancestors 'none'. Permissions-Policy denies
  unused features. Cross-Origin-Opener-Policy and Cross-Origin-Resource-Policy are `same-origin`.
  `Cache-Control: no-store` on every `/api/auth` response and every `/api/me` response.
- Every query is scoped by `user_id` server-side. Another user's id returns **404**, never 403.
- Request body limit 64 KB. All inputs validated with zod. No secrets or tokens in logs.
- **Validation status**: 400 is schema or shape validation (zod, including unknown fields rejected
  by `.strict()`). 422 is a domain rule that the shape already passed (a future date, an earlier
  stage event, a breached password, or `applied_on` cannot be changed).

## Demo
- Open sign-up, plus a **Try the demo** button: creates a throwaway verified user (`is_demo`),
  seeds fictional applications, signs in, and expires 24h later.
- An hourly job deletes expired demo users (cascade). Demo users can't change email or password.
- Fictional companies only (Acme Robotics, Northwind Labs, Globex, Initech, Hooli). No real data.

## Screenshot capture
`?screenshot=1` hides the demo and unverified banners only when the client is not a production build.
Production ignores it. `GET /api/test/mailbox` exists only when `NODE_ENV=test`. A hero demo seed
(`POST /api/demo` body `{ seed: "hero" }`) is ignored in production.

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
