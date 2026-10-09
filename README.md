# pipeline

A job-search pipeline that keeps stage history instead of overwriting a status.

The application screens are not in this pass. The API, auth, and a minimal client shell are.

## Run locally

1. Create a Postgres database and copy the env file.

```bash
cp .env.example .env
```

2. Set `DATABASE_URL`, `SESSION_SECRET`, and `ENCRYPTION_KEY` in `.env`. Placeholders are in `.env.example`. Do not commit `.env`.

3. Install, migrate, and start the API and the client.

```bash
npm install
npm run db:migrate
npm run dev
```

The client runs at <http://localhost:5173> and proxies `/api` to the server on port 3000. Dev mail is printed to the server console because `RESEND_API_KEY` is unset. Tests use an in-memory mail sink instead.

## Stack

React 18, TypeScript, Vite, Tailwind CSS, TanStack Query, React Router, Hono, Drizzle, Postgres, zod, argon2id, vitest, Playwright.

## Deploy

`render.yaml` defines one Render web service. Postgres is external Neon, passed in as `DATABASE_URL`. There is no Render database. Set the env vars from `.env.example` on the service. `APP_URL` is the public https origin. Production mail requires `RESEND_API_KEY`. `TRUSTED_PROXY_HOPS` is `1` on Render so the client IP is the rightmost `X-Forwarded-For` hop; local `.env` uses `0` and ignores that header. See `docs/SECURITY.md`.

I made history append-only so days-in-stage stays honest when a stage is revisited.

I made stages a fixed enum, not user-defined, so the demo stays small.

Notes live on the application and optionally on a stage event: the event note is what changed, the application note is the running summary.
