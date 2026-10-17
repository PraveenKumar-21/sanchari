# Sanchari — Trip Planner

Plan a trip destination by destination and day by day, then export a clean itinerary as a PDF.

**Live:** https://sanchari-trips.vercel.app

Built spec-first: the specs in [`specs/`](specs/) are the source of truth.

| Spec                                                   | What it covers                                                         |
| ------------------------------------------------------ | ---------------------------------------------------------------------- |
| [goal-spec.md](specs/goal-spec.md)                     | Problem, use cases (UC-x), features (F-x), success checklist, glossary |
| [frontend-spec.md](specs/frontend-spec.md)             | Pages, components, state, flows, accessibility                         |
| [backend-spec.md](specs/backend-spec.md)               | Architecture, schema, business rules (BR-x), security, deployment      |
| [api-contract-spec.md](specs/api-contract-spec.md)     | The REST contract (`/api/v1`)                                          |
| [implementation-plan.md](specs/implementation-plan.md) | Build phases, V1 deviations from the specs, V1.1 backlog               |

## Stack

- **Frontend:** React 19, Vite, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query, React Router, React Hook Form, `@react-pdf/renderer`
- **Backend:** Fastify 5, Zod, Drizzle ORM, PostgreSQL 17, Argon2id, cookie sessions
- **Shared:** a `shared/` package with the Zod schemas, types and date rules used by both sides
- **Hosting:** Vercel Hobby (CDN + one Vercel Function) and Neon Free (Postgres)

## Getting started

Requirements: Node.js 22 and pnpm 10. No Docker is needed: local development uses PGlite, an embedded Postgres.

```bash
pnpm install
cp .env.example .env   # defaults: PGlite database in .data/
pnpm dev               # frontend http://localhost:5173, API http://localhost:3000
```

The local database is created and migrated automatically on first start. To develop against a Neon branch instead, put its connection strings in `.env`.

## Scripts

| Command                                                  | What it does                                                                                 |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `pnpm dev`                                               | Run the backend and frontend with hot reload (Vite proxies `/api` to the backend)            |
| `pnpm lint && pnpm typecheck && pnpm test && pnpm build` | The full check, the same as CI                                                               |
| `pnpm test`                                              | Unit tests (`shared`, `frontend`) and API integration tests (`backend`, on in-memory PGlite) |
| `pnpm db:generate`                                       | Create a SQL migration after changing `backend/src/db/schema.ts` (commit it)                 |
| `pnpm db:migrate`                                        | Apply migrations to `DATABASE_URL_UNPOOLED` (or `DATABASE_URL`)                              |

## Project layout

```
shared/     Zod schemas, types, date helpers, business rules (used from source)
backend/    Fastify app: src/app.ts (buildApp), modules/, plugins/, db/ (schema + migrations)
frontend/   React app: routes/, features/ (auth, trips, itinerary, pdf), components/
api/        Vercel Function entry; re-exports the bundled backend (backend/dist/vercel.js)
specs/      The specs
```

## Deployment

Pushing to `main` deploys to production. Vercel builds other branches only once Neon preview branching is enabled (see the implementation plan).

The Vercel build runs `pnpm vercel-build`:

1. **Migrations:** `db:migrate` runs against Neon.
2. **Backend bundle:** the Fastify app is bundled with esbuild.
3. **Frontend:** the frontend is built with Vite.

`vercel.json` routes `/api/*` to the function and every other path to the single-page app. It also sets the security headers, and schedules the daily cleanup cron (`GET /api/internal/cleanup`, protected by `CRON_SECRET`).

**Production environment variables** (Vercel → Settings → Environment Variables):

| Variable                                | Source                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------ |
| `DATABASE_URL`, `DATABASE_URL_UNPOOLED` | Set by the Neon integration                                              |
| `APP_ORIGIN`                            | `https://sanchari-trips.vercel.app`                                      |
| `CRON_SECRET`                           | A random string of 32+ characters (Vercel sends it to the cron endpoint) |

## Backups and restore

Neon's Free plan keeps a **6-hour restore window**. To recover from a mistake, go to Neon console → your project → **Branches** → _Restore_ to a point in time. Restore into a new branch first if you want to inspect the data before switching over. Nightly off-site dumps are in the V1.1 backlog.

## Known limitations (V1)

- No password recovery: a forgotten password means the account can't be recovered.
- Only one person plans each trip; companions get the exported PDF.
- The PDF font covers Latin (with accents), Greek, Cyrillic and common symbols, but not Indic or CJK scripts.
- Runtime logs are kept for 1 hour on Vercel's Hobby plan.

## Font license

The PDF export bundles DejaVu Sans (Bitstream Vera license); see [`frontend/src/features/pdf/fonts/LICENSE-DejaVu.txt`](frontend/src/features/pdf/fonts/LICENSE-DejaVu.txt).
