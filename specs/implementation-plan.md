# Implementation Plan — Sanchari V1 (one-day build)

> Status: Active | Owner: Praveen Kumar | Target: implement and deploy V1 on 2026-10-17
> Builds: [goal-spec.md](./goal-spec.md) · [frontend-spec.md](./frontend-spec.md) · [backend-spec.md](./backend-spec.md) · [api-contract-spec.md](./api-contract-spec.md)

## 1. Goal for Today
By the end of the day, `https://sanchari.vercel.app` runs V1: every MVP feature (F-1 to F-7), deployed on Vercel Hobby + Neon Free. The goal-spec §7 success checklist passes by hand on a desktop browser and a phone.

The specs describe the full MVP. To fit one day, a few supporting pieces are **deferred to V1.1** (§3). They're tracked here, so the specs don't need to change.

## 2. Ground Rules
- **The specs are the source of truth.** If the code has to differ from a spec, either update the spec in the same commit, or list the difference in §3.
- **Vertical slices:** each phase goes from the database to the UI and ends with something that works.
- **Tests come from acceptance criteria:**
  - Shared rules: unit tests.
  - Every endpoint: integration tests.
  - UI: checked by hand at each phase gate.
- **Commits:** one commit per task group, with the spec IDs in the message (e.g. `F-5, BR-13`). Push at the end of each phase; each push to `main` deploys Production. Before launch, that's fine.
- **Phase gate:** a phase is done only when its "Done when" list passes. If a phase runs more than 50% over its timebox, cut items from §3.2 before going on.

## 3. V1 Scope

### 3.1 Deviations from the specs (decided for today)
| Spec | Spec says | V1 does | Why | Follow-up |
|------|-----------|---------|-----|-----------|
| backend §2, §17.4 | Node.js 24 | Node.js 22 LTS, both locally and on Vercel | Node 22 is what's installed. Still LTS (until April 2027). | Move to 24 in V1.1 |
| backend §14, §17.1 | Docker Compose Postgres for dev and tests | Local development uses a Neon `dev` branch. Tests use **PGlite** (real Postgres compiled to WebAssembly, running inside the test process). | Docker isn't installed; this means nothing extra to install. | Optional: Docker for local dev |
| backend §17.1, §17.2 | Preview deployments with Neon preview branches | **Only Production deploys**: Vercel's "Ignored Build Step" skips any branch other than `main`. | Without branching, a Preview would run migrations against the production database. | V1.1: turn on Neon preview branching, then Previews |
| backend §17.4 | `main` protected; changes only through PRs that pass CI | Push straight to `main`; CI still runs on every push | One person, one day | Protect `main` after launch |
| backend §14 | OpenAPI document generation plus a CI check that it's up to date | Not in V1. The shared Zod schemas still keep the frontend and backend in sync. | Saves time; the risk is low | V1.1 |
| backend §17.6 | Nightly encrypted `pg_dump` from GitHub Actions | Neon's 6-hour point-in-time restore only | Saves time; data is low-value before launch | V1.1 |
| frontend §13 | Component tests (RTL + MSW), plus Playwright end-to-end tests for each checklist item | The goal-spec §7 checklist run by hand at the final gate. If time allows, one Playwright smoke test. | Saves time; the backend integration tests cover the rules | V1.1 |

### 3.2 Cut list (cut in this order only if we fall behind)
Each of these is in the specs and planned for today, and each can be removed without losing an MVP feature:
1. `DayNav` jump navigation (frontend §4.5). The Day cards still work with plain scrolling.
2. The Undo toast for Activity delete. Fall back to deleting immediately, without undo (the `position` field on POST stays in the API).
3. Warning on "Discard changes?" when cancelling the Trip form.
4. Skeleton loaders. Fall back to a single spinner.
5. The daily cleanup cron. Expired Sessions are already cleaned lazily on login; old `rate_limits` rows are harmless for weeks.

## 4. Prerequisites — Your Actions
These need your accounts, so I can't do them. Each one is listed in the phase where it's needed.

| # | When | Action |
|---|------|--------|
| U1 | Phase 0 start | Run `corepack enable pnpm` (it may need `sudo`). Check with `pnpm --version`. |
| U2 | Phase 0 | Create a **private** GitHub repo named `sanchari`, with no README, so it's empty. Send me the URL. Make sure `git push` works from this machine (HTTPS token or SSH key). |
| U3 | Phase 0 | In Vercel (Hobby): **Add New → Project →** import the repo. Name the project `sanchari`. Leave the build settings alone; they come from `vercel.json`. Set Node.js to 22. |
| U4 | Phase 0 | In the Vercel project: **Storage → Neon** (Free plan), in a region near you, connected to **Production and Development only**. |
| U5 | Phase 0 | In the Neon console: create a branch named `dev`, and send me its **pooled and direct connection strings** for the local `.env`. Don't paste production credentials. |
| U6 | Phase 0 | In Vercel → Settings → Functions: set the region to match Neon's region. |
| U7 | Phase 6 | In Vercel → Environment Variables (Production): set `APP_ORIGIN` (the actual production URL) and `CRON_SECRET` (I'll generate one). |
| U8 | Each gate | Click through the deployed site on desktop **and phone**, and tell me "go" or what's broken. |

## 5. Phases

Timeboxes are for my work. Your actions (U-items) happen alongside it where possible.

### Phase 0 — Bare-bones deploy (≈ 1.5 h)
**Goal:** a "hello" version of the full stack running locally **and** at `sanchari.vercel.app`, to surface hosting problems first.

| Task | Details | Spec |
|------|---------|------|
| 0.1 Workspace | Root `package.json` with scripts; `pnpm-workspace.yaml`; a base `tsconfig`; ESLint + Prettier; `.nvmrc` (22); `.env.example`; `CLAUDE.md` with the project rules | backend §15 |
| 0.2 `shared/` package | TypeScript package skeleton, built with `tsc`, imported by `frontend` and `backend` | backend §3.2 |
| 0.3 Backend skeleton | Fastify `buildApp()`, the Zod type provider, `config.ts` (environment variables checked with Zod), pino logging with redaction, the error-handler plugin, `GET /api/health` and `/api/health/ready`, and `server.ts` for local development | backend §3.1, §10, §12 |
| 0.4 Database wiring | Drizzle with `pg` (Neon) and PGlite in tests; `drizzle.config.ts`; `db:generate` and `db:migrate` scripts; the first migration (empty, or `users` only) | backend §5, §17.5 |
| 0.5 Vercel adapter | `api/index.ts` wraps `buildApp()`. `vercel.json`: build command (migrate, then build), output `frontend/dist`, rewrites (`/api/*` → the function, SPA fallback), and the ignored build step for branches other than `main` | backend §17.2 |
| 0.6 Frontend skeleton | Vite + React + TypeScript, Tailwind, shadcn/ui setup, React Router, TanStack Query, Sonner; `AppShell`; a placeholder home page that calls `/api/health/ready`; the Vite dev proxy for `/api` | frontend §2, §14 |
| 0.7 Test setup and CI | Vitest in all three packages; a PGlite test helper; `.github/workflows/ci.yml` (lint, typecheck, test, build) | backend §14 |
| 0.8 First deploy | Push to GitHub, so Vercel deploys | — |

**Done when:**
- [ ] `pnpm dev` serves the page locally, and it shows "API: ok, DB: ok" (against the Neon `dev` branch)
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` all pass
- [ ] `https://sanchari.vercel.app` shows the same page; `/api/health/ready` returns `200`
- [ ] CI is green on GitHub

### Phase 1 — Shared domain rules (≈ 1 h)
**Goal:** all the validation and date logic, fully unit-tested, before any feature uses it.

| Task | Details | Spec |
|------|---------|------|
| 1.1 Constants | `MAX_TRIP_DAYS=60`, `MAX_DESTINATIONS=10`, `MAX_ACTIVITY_LEN=500`, `MAX_ACTIVITIES_PER_DATE=50`, `MAX_TRIPS_PER_USER=200`, and the `TRIP_TYPES` labels | api §5, backend §6 |
| 1.2 Date helpers | `isValidDate`, `addDays`, `diffDays`, `listTripDates`, `dayNumber`, `destinationsForDate` (two on a Travel Day), and `tripDates(destinations)`. Everything works on `YYYY-MM-DD` strings, never `new Date(str)`. | frontend §6.4 |
| 1.3 Sequence rule | `validateDestinationSequence()`: sort, then check for Travel Days, overlaps, gaps, and the 60-day limit. Returns `{ path, message }` issues, as in the contract. | BR-5, BR-6, BR-7 |
| 1.4 Zod schemas | Auth, Trip (input, summary, detail), Destination, Activity (create, patch), reorder, the error envelope, and inferred types | api §4, §5, §7; BR-1 to BR-9 |
| 1.5 Unit tests | Every rule, including edge cases: a 1-day trip, Travel Days, a gap, an overlap, exactly 60 vs 61 days, 29 Feb, usernames with mixed case | goal §8 |

**Done when:**
- [ ] `pnpm --filter shared test` is green, covering every BR-1 to BR-9 rule and the edge cases above

### Phase 2 — Database and auth slice (≈ 1.5 h)
**Goal:** a User can sign up, log in, stay logged in, and log out, locally and in production.

| Task | Details | Spec |
|------|---------|------|
| 2.1 Full schema | Drizzle tables: `users`, `sessions`, `trips`, `destinations`, `activities`, `rate_limits`, plus the `trip_type` enum and the indexes and checks. Generate and commit the migration. | backend §5 |
| 2.2 Auth library | `password.ts` (Argon2id, with a dummy hash so timing doesn't reveal usernames); `session-token.ts` (random bytes, base64url, SHA-256) | backend §7 |
| 2.3 Security plugin | helmet; the Origin check (with `VERCEL_URL` support); the JSON-only rule for bodies; the 100 KB body limit; the Postgres-backed rate limiter | backend §7, §11; api §2, §8 |
| 2.4 Auth plugin and routes | `authenticate` preHandler; `POST /signup`, `POST /login`, `POST /logout`, `GET /me`; sliding Sessions; the cookie flags; lazy cleanup of expired Sessions | api §7.1, backend §7 |
| 2.5 Integration tests | Each auth path and error code: `USERNAME_TAKEN`, `INVALID_CREDENTIALS`, an expired Session, sliding renewal, `RATE_LIMITED`, the Origin check returning `403` | backend §14 |
| 2.6 Frontend auth | API client (`ApiError`, `credentials: 'include'`, a global 401 handler); `useMe`/`useLogin`/`useSignup`/`useLogout`; `ProtectedRoute`/`PublicOnlyRoute` with a safe `returnTo`; the Login and Sign Up pages; the logout menu in `AppShell` | frontend §4.1, §4.2, §8, §11 |

**Done when:**
- [ ] Integration tests are green
- [ ] Locally and in production: sign up → land on `/trips` (a placeholder) → reload and stay logged in → log out → `/trips` redirects to `/login`

### Phase 3 — Trips slice (≈ 1.5 h)
**Goal:** create, list, edit, and delete Trips with multiple Destinations.

| Task | Details | Spec |
|------|---------|------|
| 3.1 Trips service and routes | `GET /trips`, `POST /trips`, `GET /trips/:id`, `PUT /trips/:id` (the full `updateTrip` algorithm, including BR-12's confirm flow), `DELETE /trips/:id`. Scoped by owner (`404` for someone else's Trip); `LIMIT_REACHED` at 200 Trips. | api §7.2, backend §8, BR-7, BR-8, BR-11, BR-12 |
| 3.2 Integration tests | Create and list order; another User's Trip returns `404`; validation paths after sorting; the BR-12 `409` and the confirmed delete; delete cascades | backend §14 |
| 3.3 Trip List page | Upcoming and Past sections, `TripCard` (Destination chain, dates, day count, Trip Type badge), empty state, delete with `ConfirmDialog` | frontend §4.3 |
| 3.4 Trip form | `TripForm`, `TripTypeRadio`, `DestinationFields` (add, remove, auto-sort, the default start date), `DateRangePicker`, the live summary line, field-level errors from Zod and the API. Create and Edit pages. | frontend §4.4 |

**Done when:**
- [ ] Integration tests are green
- [ ] In production: create a 2-Destination Trip with a Travel Day → it appears in the list → edit its name and dates → delete it

### Phase 4 — Itinerary slice (≈ 2 h)
**Goal:** day-by-day planning, the heart of the app.

| Task | Details | Spec |
|------|---------|------|
| 4.1 Activities service and routes | `POST` (with optional `position`, shifting later Activities), `PATCH`, `DELETE` (renumbering what's left), `PUT …/days/:date/activity-order` (BR-13 `409`). Trip row locked during each change; BR-9, BR-10, BR-11 enforced. | api §7.3, backend §8 |
| 4.2 Integration tests | Insert in the middle; positions stay continuous after delete; a stale reorder returns `409`; a date outside the Trip returns `400`; the 50-per-date limit; another User's Activity returns `404` | backend §14 |
| 4.3 Itinerary page | `TripHeader`, `DayCard` for each date (Day Number, date, Destination(s), with Travel Day labels), `ActivityItem` (in-place edit, move up/down, delete), `ActivityInput` (Enter adds; focus stays), optimistic updates with rollback | frontend §4.5, §6.2 |
| 4.4 Shrink-dates confirmation | The Edit form predicts which Activities would be deleted, shows `ConfirmDialog`, and resends with `confirmDeleteActivities: true`; it also handles a `409` from the server | frontend §4.4, §7.4; api §7.2 |
| 4.5 Undo and DayNav | Undo toast (re-POST at the old `position`); `DayNav` sidebar or strip | frontend §4.5 *(cut list 1, 2)* |

**Done when:**
- [ ] Integration tests are green
- [ ] In production: add, edit, reorder, and delete Activities across several Days, including a Travel Day; shrink a Destination and confirm; the Day Numbers update correctly

### Phase 5 — PDF export (≈ 45 min)
| Task | Details | Spec |
|------|---------|------|
| 5.1 PDF document | `ItineraryPdfDocument`: title block, Destinations table, one section per Day, footer with page numbers; A4 | frontend §4.6 |
| 5.2 Export button | Lazy `import()` of `@react-pdf/renderer`, a "Preparing PDF…" state, the slugified filename | frontend §4.6, §12 |

**Done when:**
- [ ] In production: the PDF downloads on desktop and opens on the phone; text can be selected; a long Day flows onto the next page

### Phase 6 — Launch (≈ 1 h)
| Task | Details | Spec |
|------|---------|------|
| 6.1 Production configuration | `APP_ORIGIN` and `CRON_SECRET` set (U7); the function region matches Neon (U6); CSP and security headers in `vercel.json`; the daily cron for `/api/internal/cleanup` *(cut list 5)* | backend §11, §12, §17.2 |
| 6.2 Polish | Not Found page, error boundary, loading states, a check at 360 px width, a keyboard-only pass on the main flow, the "no password recovery" note on Sign Up | frontend §4.7, §10, §11 |
| 6.3 Acceptance run | The goal-spec §7 checklist, by hand, on desktop and phone (U8) | goal §7 |
| 6.4 Release | `README.md` (setup, scripts, deploy, how to restore from Neon); tag `v1.0.0`; record the V1.1 follow-ups (§3.1) as the next plan | — |

**Done when:**
- [ ] Every item in the goal-spec §7 checklist passes in production on desktop and phone
- [ ] `v1.0.0` is tagged and pushed

## 6. Schedule at a Glance
| Phase | Timebox | Running total |
|-------|---------|---------------|
| 0 Bare-bones deploy | 1.5 h | 1.5 h |
| 1 Shared rules | 1 h | 2.5 h |
| 2 Auth | 1.5 h | 4 h |
| 3 Trips | 1.5 h | 5.5 h |
| 4 Itinerary | 2 h | 7.5 h |
| 5 PDF | 0.75 h | 8.25 h |
| 6 Launch | 1 h | **≈ 9.25 h** |

This is a full day. The biggest risks are Phase 0 (whether the platform works as expected) and Phase 4 (the most UI). If Phase 0 is fine by the 2-hour mark, the rest is routine work; if not, we fix the deployment first.

## 7. V1.1 Backlog (after launch)
- Everything in §3.1's "Follow-up" column
- Anything cut from §3.2
- Protect `main`; turn on Neon preview branching and Vercel Previews
- Component and Playwright end-to-end test suites
- OpenAPI generation and the contract check
- Nightly encrypted backups
