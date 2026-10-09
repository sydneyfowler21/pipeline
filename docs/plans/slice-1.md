# Slice 1 plan — pipeline

> Delete this file in the PR that lands slice 1. SPEC.md is the lasting source of truth.

## Scope
1. **Scaffold**: npm workspaces `client/` (Vite, React, TS, Tailwind, shadcn/ui), `server/` (Hono),
   `shared/` (zod schemas, `computeTimeline`). ESLint, Prettier, strict TS.
2. **Schema**: Drizzle schema + migrations for users, applications, stage_events (with append-only
   trigger), sessions, auth_tokens, auth_events, rate_limits. No status column.
3. **Auth (email/password)**: sign-up with argon2id + HIBP check, email verification via Resend,
   sign-in/out, sign-out-all, password reset, Postgres sessions, CSRF, rate limits + lockout,
   no enumeration, audit log page. Security headers/CSP.
4. **Applications**: create (writes Applied event), edit, delete (cascade); stage moves with
   occurred_at rules.
5. **Views**: list sorted by last activity; detail with timeline, per-visit days, per-stage totals;
   empty/loading/error states; Try the demo + 24h expiry job.
6. **Tests + CI + deploy**: vitest unit/API tests and Playwright e2e driven by `fixtures/slice-1.json`;
   GitHub Actions; `render.yaml` for one Render web service + Neon `DATABASE_URL`.
7. **README screenshot** (slice-1 acceptance item).

## Deferred to slice 2
TOTP 2FA + recovery codes, Sign in with GitHub.

## Test matrix (from the fixture)
- `computeTimeline` reproduces every `expected` block for `today = 2026-10-09`, tz America/Denver,
  including the late-evening event that is a different UTC date.
- API: list order for user A = Globex, Northwind Labs, Acme Robotics; user B sees only Initech.
- API: user B gets 404 for every user A application id on GET/PATCH/DELETE/POST stage.
- API: stage_events rows are only ever inserted; a raw UPDATE/DELETE raises.
- API: future occurred_at → 422; occurred_at before latest event → 422; same stage → 409.
- E2E: acceptance 1 from SPEC.md.

## Done when
CI green on the PR, deployed on Render, Quincy's QA + Dani's design checklist pass, plan file deleted.
