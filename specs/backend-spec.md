# Backend Spec — Sanchari Trip Planner

> Status: Draft | Owner: Praveen Kumar | Last updated: 2026-10-17
> Related: [goal-spec.md](./goal-spec.md) · [frontend-spec.md](./frontend-spec.md) · [api-contract-spec.md](./api-contract-spec.md)

## 1. Overview
A JSON REST API that stores Users, Sessions, Trips, Destinations, and Activities. It authenticates Users with a session cookie and enforces every business rule in `goal-spec.md` §8; the frontend's checks are a convenience, while the backend is the authority. In production, the API runs as a Vercel Function, and the frontend is served from Vercel's CDN on the same domain, so the whole app is on one origin. The database is Neon Postgres. Both are on free plans (§17).

The backend does **not** generate PDFs. Itinerary Export happens in the browser (frontend-spec §4.6).

Glossary terms are used exactly as defined in `goal-spec.md` §9.

## 2. Tech Stack
- **Language / runtime:** TypeScript (`strict`) on Node.js 24 LTS
- **Framework:** Fastify 5
- **Validation:** Zod, through `fastify-type-provider-zod`. The schemas live in the `shared/` package and are also used by the frontend (§3.2).
- **API docs:** `@fastify/swagger` generates an OpenAPI document from the Zod schemas, served at `/api/docs` outside production.
- **Database:** PostgreSQL 17: Neon (serverless Postgres) in production and preview, Docker Compose locally
- **ORM / query layer:** Drizzle ORM (type-safe, SQL-like queries)
- **Migrations:** `drizzle-kit`. Generated SQL migration files are committed to the repo.
- **Auth:** our own session-cookie auth: an opaque random token, stored as a hash in Postgres (§7). No auth library or third-party provider.
- **Password hashing:** Argon2id (`@node-rs/argon2`)
- **Security plugins:** `@fastify/cookie`, `@fastify/helmet`. Rate limiting is our own small Postgres-backed limiter, because in-memory limits don't work across serverless instances (§11).
- **Logging:** pino (built into Fastify)
- **Caching:** none in the MVP
- **Background jobs / queues:** none. A daily Vercel Cron Job cleans up expired Sessions (§12).
- **Testing:** Vitest; `fastify.inject()` for HTTP tests against a real Postgres database
- **Package manager:** pnpm workspaces (monorepo: `frontend/`, `backend/`, `shared/`)
- **Hosting:** Vercel Hobby (free): the frontend on the CDN and the Fastify API as one Vercel Function (Fluid compute). The database is Neon Free, added through the Vercel Marketplace (§17).
- **TLS / domain:** provided by Vercel: `https://sanchari.vercel.app`, with the certificate managed automatically

## 3. Architecture

### 3.1 Layers
```
HTTP request
   │
   ▼
Fastify route ── Zod schema validates params, query, and body; types the handler
   │             auth preHandler loads the Session and sets request.user
   ▼
Service ──────── business rules (BR-*), ownership checks, transactions
   │
   ▼
Drizzle ──────── SQL queries against PostgreSQL
   │
   ▼
Response ─────── Zod response schema strips fields that aren't in the contract
                 errors go through the central error handler → standard error shape
```
- **Routes** stay thin: they read the validated input, call one service function, and return its result.
- **Services** hold all the logic and own transactions. They take `userId` explicitly, so ownership can't be forgotten.
- There's no separate repository layer: services call Drizzle directly. That's enough at this size.

### 3.2 The `shared/` package
The single source of truth for anything both sides must agree on:
- Zod schemas for every request and response body (the code form of `api-contract-spec.md`)
- Inferred TypeScript types (`Trip`, `Destination`, `Activity`, …)
- Date helpers and the rules for a valid Destination sequence (`listTripDates`, `validateDestinationSequence`, `MAX_TRIP_DAYS`, …)

The frontend imports these instead of maintaining its own copies (frontend-spec §2, §14).

### 3.3 Production topology
```
Browser ──HTTPS──▶ Vercel edge (sanchari.vercel.app, TLS, DDoS protection)
                     ├── /assets/*, /index.html, ... → CDN: frontend/dist static files
                     ├── /api/*                      → Vercel Function (api/index.ts → Fastify buildApp())
                     │                                   ├── /api/v1/*          → API routes
                     │                                   ├── /api/health*       → health checks
                     │                                   ├── /api/internal/*    → cron-only maintenance
                     │                                   └── /api/docs          → OpenAPI UI (disabled in production)
                     │                                         │ pooled connection (TLS)
                     │                                         ▼
                     │                                   Neon Postgres 17 (Free plan, same region as the function)
                     └── any other path              → /index.html (SPA fallback)

GitHub Actions ── nightly pg_dump ──▶ encrypted workflow artifact (30-day retention)
```
Because the app is on one origin, the session cookie can be `SameSite=Lax` and no CORS setup is needed. The function is stateless: Sessions and rate-limit counters live in Postgres, never in memory.

## 4. Domain Model
| Entity | Description | Relationships |
|--------|-------------|---------------|
| User | An Account: a unique Username and a password hash | Has many Sessions and Trips |
| Session | A logged-in browser; holds a hash of the token, and an expiry | Belongs to one User |
| Trip | Name, Trip Type, and the derived Trip Dates | Belongs to one User (the Trip Owner); has 1–10 Destinations and many Activities |
| Destination | A place with a start date and end date, ordered within its Trip | Belongs to one Trip |
| Activity | Free text on one calendar date within a Trip, ordered within that date | Belongs to one Trip |

**Key design decision:** Activities belong to the **Trip and a calendar date**, not to a Destination or a Day Number (frontend-spec §7.4). Days aren't stored at all; they're calculated from the Trip Dates. So:
- Changing Destinations never moves Activities. It can only remove dates from the Trip (BR-12).
- A Travel Day's Activities belong to neither Destination specifically, which matches how the Travel Day is shown.

## 5. Database Schema
All tables use `uuid` primary keys generated by `gen_random_uuid()` and `timestamptz` audit columns. All calendar dates use the Postgres `date` type and are exchanged as `YYYY-MM-DD` strings (§13).

### Table: `users`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK | |
| username | varchar(30) | NOT NULL, UNIQUE | Stored lowercase (BR-1) |
| password_hash | text | NOT NULL | Argon2id hash in PHC string format |
| created_at | timestamptz | NOT NULL, default `now()` | |

### Table: `sessions`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | char(64) | PK | SHA-256 hex hash of the session token. The raw token is never stored. |
| user_id | uuid | NOT NULL, FK → `users.id` ON DELETE CASCADE | |
| created_at | timestamptz | NOT NULL, default `now()` | |
| expires_at | timestamptz | NOT NULL | |

- **Indexes:** `(user_id)`, `(expires_at)` for cleanup

### Table: `trips`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK | |
| user_id | uuid | NOT NULL, FK → `users.id` ON DELETE CASCADE | Trip Owner |
| name | varchar(100) | NOT NULL | |
| trip_type | `trip_type` enum | NOT NULL | `solo`, `couple`, `family`, `friends` |
| start_date | date | NOT NULL | Derived: earliest Destination start. Kept in sync by the service (BR-7). |
| end_date | date | NOT NULL, CHECK `end_date >= start_date` | Derived: latest Destination end |
| created_at | timestamptz | NOT NULL, default `now()` | |
| updated_at | timestamptz | NOT NULL, default `now()` | |

- **Indexes:** `(user_id, start_date)` for the Trip List
- `start_date` and `end_date` are stored even though they can be calculated, so listing and sorting Trips doesn't have to scan Destinations.

### Table: `destinations`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK | |
| trip_id | uuid | NOT NULL, FK → `trips.id` ON DELETE CASCADE | |
| position | smallint | NOT NULL, UNIQUE `(trip_id, position)` | 0-based, in start-date order |
| name | varchar(100) | NOT NULL | |
| start_date | date | NOT NULL | |
| end_date | date | NOT NULL, CHECK `end_date >= start_date` | |

- **Indexes:** covered by the unique `(trip_id, position)` index

### Table: `activities`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK | |
| trip_id | uuid | NOT NULL, FK → `trips.id` ON DELETE CASCADE | |
| date | date | NOT NULL | Must fall within the Trip Dates (BR-10) |
| position | integer | NOT NULL | 0-based order within the date, kept continuous (0, 1, 2, …) by insert, delete, and reorder (api-contract §5) |
| text | varchar(500) | NOT NULL | Trimmed, single line (BR-9) |
| created_at | timestamptz | NOT NULL, default `now()` | |
| updated_at | timestamptz | NOT NULL, default `now()` | |

- **Indexes:** `(trip_id, date, position)`
- There is no unique constraint on `position`, so shifting and reordering are simple position rewrites inside a transaction (§8). Each operation that touches a date's Activities first locks the Trip row (`FOR UPDATE`), so concurrent requests can't corrupt the order.

### Table: `rate_limits`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| key | text | PK | Limit name + subject, e.g. `login:203.0.113.7:praveen_k` or `signup:203.0.113.7` |
| window_start | timestamptz | NOT NULL | Start of the current fixed window |
| count | integer | NOT NULL | Requests seen in this window |

- **Update:** one atomic `INSERT … ON CONFLICT (key) DO UPDATE` per limited request. It resets `count` to 1 when the window has passed, otherwise adds 1, and returns the new count.
- **Cleanup:** rows whose window ended more than a day ago are deleted by the daily cron (§12).

- **Cascade rules (summary):** deleting a User deletes their Sessions and Trips; deleting a Trip deletes its Destinations and Activities.

## 6. Business Rules & Validation
"Zod" means the rule lives in a `shared/` schema, so it's checked on both the frontend and the backend. "Service" means the rule needs the database or the whole Trip, so it's checked in a backend service.

| Rule ID | Rule | Enforced Where |
|---------|------|----------------|
| BR-1 | Username: 3–30 characters, only `a–z`, `0–9`, `_`, `.`, `-`. Case-insensitive: lowercased before validating and storing. Must be unique. | Zod + unique index (→ `409 USERNAME_TAKEN`) |
| BR-2 | Password: 8–128 characters, any characters. No other complexity rules (follows NIST SP 800-63B). | Zod |
| BR-3 | Trip name: 1–100 characters after trimming. | Zod |
| BR-4 | Trip Type is one of `solo`, `couple`, `family`, `friends`. | Zod + DB enum |
| BR-5 | A Trip has 1–10 Destinations. Each name is 1–100 characters after trimming; each `endDate` is on or after its `startDate`. | Zod |
| BR-6 | Destination sequence: after sorting by `startDate`, each Destination starts on the previous one's `endDate` (a Travel Day) or the day after. No overlaps beyond a Travel Day, and no gaps. | Zod (`validateDestinationSequence`), with errors pointing at the offending Destination |
| BR-7 | Trip Dates = earliest `startDate` to latest `endDate`, recalculated and saved on every Trip write. Total length is at most 60 days (inclusive). | Zod (length) + Service (saving) |
| BR-8 | Every Trip, Destination, and Activity operation is scoped to the current User. A Trip that doesn't exist and a Trip owned by someone else both return `404 NOT_FOUND`, so other Users' Trip IDs aren't revealed. | Service (`WHERE user_id = $currentUser`) |
| BR-9 | Activity text: trimmed, 1–500 characters, no line breaks (`\r` or `\n`). | Zod |
| BR-10 | An Activity's `date` must be within the Trip Dates. | Service (→ `400 VALIDATION_ERROR`) |
| BR-11 | At most 50 Activities per date, and at most 200 Trips per User (limits against abuse). | Service (→ `409 LIMIT_REACHED`) |
| BR-12 | If a Trip update removes dates that have Activities, the request must include `confirmDeleteActivities: true`; otherwise it's rejected with `409 ACTIVITIES_WOULD_BE_DELETED`, listing the affected dates and counts. When confirmed, those Activities are deleted in the same transaction. | Service |
| BR-13 | Reordering must list exactly the Activity IDs currently on that date, each once. | Service (→ `409 CONFLICT` if the list is stale) |

## 7. Authentication & Authorization
- **Auth mechanism:** Session cookie with a server-side Session record.
  1. On signup or login, generate 32 random bytes (`crypto.randomBytes`) and encode them in base64url. That string is the **session token**.
  2. Store `sha256(token)` as `sessions.id`, with `expires_at = now() + SESSION_TTL_DAYS`.
  3. Send the raw token to the browser in a cookie. Even if the `sessions` table leaked, the stored hashes couldn't be used as cookies.
- **Cookie:** `sanchari_session`; `HttpOnly`, `Secure` in production, `SameSite=Lax`, `Path=/`, `Max-Age` equal to the TTL.
- **Per request:** an `authenticate` preHandler hashes the cookie value, looks up a Session that hasn't expired, and sets `request.user = { id, username }`. Otherwise it returns `401 UNAUTHORIZED`. Every route except `POST /auth/signup`, `POST /auth/login`, `POST /auth/logout`, `/api/health*`, and `/api/internal/*` (which checks `CRON_SECRET` instead) requires it.
- **Session lifetime:** 14 days, sliding. When less than half the lifetime is left, the expiry is pushed back to a full 14 days and the cookie is re-sent (this happens at most about once a week per Session).
- **Logout:** deletes the Session row and clears the cookie. Always returns `204`, even if the Session was already gone.
- **Password hashing:** Argon2id with the library's default parameters (at least 19 MiB memory, 2 iterations). Login verifies against the stored hash. If the username doesn't exist, the server still verifies against a fixed dummy hash, so response timing doesn't reveal which usernames exist.
- **Login errors:** wrong username and wrong password both return `401 INVALID_CREDENTIALS` with the same message.
- **Roles & permissions:** there's one role, User. No admin in the MVP.
- **Resource ownership rules:** only the Trip Owner can read, change, or delete a Trip and anything in it (BR-8).
- **CSRF protection:**
  - The `SameSite=Lax` cookie isn't sent on cross-site POST, PUT, PATCH, or DELETE requests.
  - Request bodies must be `application/json`, which a cross-site HTML form can't send.
  - State-changing requests whose `Origin` header doesn't match `APP_ORIGIN` are rejected with `403`.

## 8. Services / Modules
| Module | Responsibility | Depends On |
|--------|----------------|------------|
| `auth` | `signup`, `login`, `logout`, `getMe`; creating, validating, sliding, and cleaning up Sessions | `db`, `lib/password`, `lib/session-token` |
| `trips` | `listTrips`, `getTrip` (the Trip with its Destinations and Activities), `createTrip`, `updateTrip` (replaces the Destination list and applies BR-6, BR-7, BR-12 in one transaction), `deleteTrip` | `db`, `shared` |
| `activities` | `createActivity` (adds at the end, or at an optional `position`, which lets the frontend's Undo restore a deleted Activity to its spot), `updateActivity`, `deleteActivity`, `reorderActivities(tripId, date, orderedIds)` | `db`, `trips` (ownership check and Trip Dates) |
| `health` | Liveness and readiness checks | `db` |
| `internal` | `GET /api/internal/cleanup`: deletes expired Sessions and stale `rate_limits` rows; requires `CRON_SECRET` | `db` |
| `plugins/auth` | The `authenticate` preHandler and the `request.user` decoration | `auth` |
| `plugins/errors` | Central error handler (§10) | — |
| `plugins/security` | helmet, rate limiting, the Origin check | — |

**`updateTrip` algorithm** (one transaction):
1. Load the Trip with `FOR UPDATE`, scoped to the current User (otherwise `404`).
2. Validate the new Destination list (BR-5, BR-6, BR-7) and calculate the new Trip Dates.
3. Find the Activities whose `date` falls outside the new Trip Dates. If there are any and `confirmDeleteActivities` isn't `true`, reject with `409 ACTIVITIES_WOULD_BE_DELETED` (`details: [{ date, count }]`).
4. Delete those Activities.
5. Delete and re-insert all of the Trip's Destinations with fresh positions. That's safe because nothing references Destinations.
6. Update the Trip's `name`, `trip_type`, `start_date`, `end_date`, and `updated_at`.
7. Return the full Trip, the same as `getTrip`.

## 9. External Integrations
None in the MVP. PDF generation happens in the browser, and there are no maps, email, or third-party APIs (goal-spec §6).

## 10. Error Handling
- **Error format:** every error response uses the shape defined in `api-contract-spec.md` §4:
  `{ "error": { "code": "…", "message": "…", "details": [...] } }`
- **Where errors come from:**
  - Services throw typed `AppError`s (`NotFoundError`, `ConflictError`, …), each carrying an HTTP status, a code, and optional details.
  - Zod validation failures become `400 VALIDATION_ERROR`, with `details: [{ path: "destinations.1.startDate", message: "…" }]` so the frontend can attach them to form fields.
  - Postgres unique-violation `23505` on `users.username` becomes `409 USERNAME_TAKEN`.
  - Anything unexpected becomes `500 INTERNAL_ERROR` with a generic message. The full error is logged with the request ID, and stack traces are never sent to the client.
- **Retry / fallback strategy:** no automatic retries on the server. Transactions are short, and a failure rolls back the whole operation.

## 11. Security
- **Input validation:** every route has Zod schemas for params, query, and body; unknown body fields are rejected. Response schemas strip anything that isn't in the contract, such as `password_hash`.
- **SQL injection:** all queries go through Drizzle with bound parameters; no SQL is built by joining strings.
- **XSS:** the API returns only JSON. The frontend renders Activity text as React text and never as raw HTML (no `dangerouslySetInnerHTML`). `@fastify/helmet` sets security headers on API responses. `vercel.json` sets a strict Content-Security-Policy and the other security headers for the static frontend.
- **CORS:** disabled, since everything is on one origin. If the frontend is ever hosted separately, allow only `APP_ORIGIN` with `credentials: true`.
- **Rate limiting:** serverless instances don't share memory, so the counters are stored in Postgres (the `rate_limits` table, §5), using fixed time windows:
  - `POST /auth/login`: 10 per minute per IP and username combination
  - `POST /auth/signup`: 5 per hour per IP
  - Exceeding a limit returns `429 RATE_LIMITED` with a `Retry-After` header.
  - There's no general per-request limit; Vercel's built-in DDoS protection (the Vercel Firewall) covers abusive traffic. Revisit if abuse shows up.
- **Secrets management:** environment variables only. Locally, `.env` is gitignored and `.env.example` is committed. In production, secrets live in Vercel's encrypted Environment Variables: `DATABASE_URL` and `DATABASE_URL_UNPOOLED` are set by the Neon integration, and `CRON_SECRET` is set by hand. Session tokens are random rather than signed, so no signing secret is needed.
- **Body size:** maximum 100 KB per request (Vercel's own limit is 4.5 MB).
- **OWASP Top 10 notes:**
  - Broken access control is covered by BR-8; each test verifies that one User can't access another's Trip.
  - Weak authentication is covered by Argon2id, rate limits, and identical login errors.
  - Security misconfiguration is covered by helmet, the CSP in `vercel.json`, and turning off `/api/docs` in production.

## 12. Observability
- **Logging:** pino JSON logs written to stdout, with a request ID on every line. `cookie`, `authorization`, `password`, and `set-cookie` are redacted. Log level: `info` in production, `debug` in development (formatted by `pino-pretty`).
- **Log storage:** Vercel Runtime Logs. On the Hobby plan, they're kept for only **1 hour**, so investigate an issue promptly, using the `X-Request-Id` the User reports. Sending logs elsewhere (log drains) needs a paid plan; that's post-MVP.
- **Metrics:** the Vercel dashboard (function invocations, errors, duration) and the Neon console (compute and storage usage). Both are free.
- **Health checks:**
  - `GET /api/health` returns `200 { status: "ok" }` (liveness, no database check)
  - `GET /api/health/ready` runs `SELECT 1` and returns `200`, or `503` if the database can't be reached
  - Optional: a free external uptime monitor polling `/api/health/ready` every 5 minutes. Note that this keeps Neon awake and uses its compute hours (§17.3).
- **Maintenance:**
  - Expired Sessions are deleted in two ways: lazily (on login, that User's expired Sessions), and by a daily Vercel Cron Job that calls `GET /api/internal/cleanup` (Vercel Cron sends `GET` requests), which also clears old `rate_limits` rows.
  - The cleanup endpoint isn't part of the public contract. It requires `Authorization: Bearer $CRON_SECRET` (Vercel sends this automatically) and returns `404` otherwise.

## 13. Performance & Scalability
- **Expected load:** tiny, under 100 Users and under 1 request per second. Well within the free tiers (§17.3).
- **Response size:** `GET /trips/:tripId` returns the whole Itinerary in one response. The worst case (60 days × 50 Activities) is about 3,000 Activities, around 1.5 MB. Typical Trips are a few KB.
- **Query plan:** `getTrip` uses 3 indexed queries (the Trip, its Destinations, its Activities) without joins that would multiply rows. `listTrips` uses 2 queries (the Trips, then all their Destinations, grouped in code).
- **Caching strategy:** none. Postgres is fast enough at this scale.
- **Pagination:** none for Trips (capped at 200 per User by BR-11).
- **Date handling:** the Postgres driver is configured to return `date` columns as strings (Drizzle `date({ mode: 'string' })`). This avoids converting dates to JavaScript `Date` objects in UTC, which can shift them by a day.
- **Database connections:** the app connects with Neon's **pooled** connection string (PgBouncer, `DATABASE_URL`), using `pg.Pool` with `max: 5` and a short idle timeout, created once per function instance. Migrations use the **direct** (unpooled) string, `DATABASE_URL_UNPOOLED`.
- **Cold starts:**
  - Neon suspends its compute after 5 minutes idle. The first request afterwards waits for it to wake up (typically under a second).
  - The Vercel Function has its own cold start (around a few hundred ms).
  - Both mostly affect the first `GET /auth/me` after a quiet period. That's acceptable for the MVP; the frontend shows a spinner (frontend-spec §8).
- **Function region:** set the Vercel Function region to the one closest to the Neon database region (e.g. both in Mumbai/`bom1` + `aws-ap-south-1`, or both in `iad1` + `aws-us-east-1`). Each request makes several database round trips, so a cross-region gap multiplies the latency.

## 14. Testing Strategy
- **Unit (Vitest):** the `shared/` validation rules (BR-1 to BR-9, especially the Destination sequence and the 60-day limit), password hashing helpers, session token helpers.
- **Integration (Vitest + `fastify.inject()` + real Postgres):** every endpoint's success path and each error code. Includes:
  - Accessing another User's Trip returns `404` (BR-8)
  - The BR-12 confirm flow, including a rollback when an error happens partway through
  - Reorder with a stale ID list returns `409`
  - Session expiry and sliding renewal
  - Rate limiting across "instances" (two app instances sharing one database still enforce one limit)
  - Each test file uses a fresh database schema, and every table is truncated between tests.
- **API / contract tests:** responses are checked against the `shared/` Zod schemas in the integration tests. A CI check fails if the generated OpenAPI document no longer matches the copy committed under `backend/openapi.json`, so changes to the contract are visible in code review.
- **Seed / fixture data:** `pnpm db:seed` creates the user `demo` (password `demo-pass-123`) with two Trips: a 5-day, two-Destination Trip with a Travel Day and some Activities, and a 1-day Trip with no Activities. Only for local development and preview database branches, never production.

## 15. Folder Structure
```
/ (repo root)                 # also the Vercel project root
  package.json              # pnpm workspace scripts: dev, build, test, lint, db:*
  pnpm-workspace.yaml       # frontend, backend, shared
  vercel.json               # build/output settings, rewrites, headers, cron, function region
  api/
    index.ts                # Vercel Function entry: adapts backend buildApp() to Vercel's request handler
  docker-compose.yml        # local Postgres 17 (dev and test databases)
  .github/workflows/
    ci.yml                  # lint, typecheck, tests, OpenAPI check, build
    backup.yml              # nightly pg_dump → encrypted artifact (§17.6)
  shared/
    src/
      schemas/              # auth.ts, trip.ts, activity.ts, error.ts (Zod)
      dates.ts              # listTripDates, dayNumber, validateDestinationSequence
      constants.ts          # MAX_TRIP_DAYS, MAX_DESTINATIONS, ...
      index.ts
  frontend/                 # see frontend-spec §14
  backend/
    drizzle.config.ts
    openapi.json            # generated, committed (contract check)
    src/
      server.ts             # local development entry: buildApp() + listen
      app.ts                # buildApp(): registers plugins and routes (used by server.ts, api/index.ts, and tests)
      config.ts             # loads and validates environment variables with Zod
      db/
        schema.ts           # Drizzle table definitions
        client.ts           # pg Pool + drizzle instance (one per function instance)
        migrations/         # generated SQL (committed)
        seed.ts
      plugins/
        auth.ts
        errors.ts
        security.ts         # helmet, Origin check, Postgres-backed rate limiter
      modules/
        auth/               # auth.routes.ts, auth.service.ts
        trips/              # trips.routes.ts, trips.service.ts
        activities/         # activities.routes.ts, activities.service.ts
        health/             # health.routes.ts
        internal/           # cleanup.routes.ts (cron only)
      lib/
        app-error.ts
        password.ts
        session-token.ts
    test/
      helpers.ts            # buildTestApp, createUser, login helpers
      *.test.ts
```

## 16. Environment Variables
| Variable | Description | Required | Example |
|----------|-------------|----------|---------|
| `NODE_ENV` | `development`, `test`, or `production` | Yes | `production` |
| `PORT` | Port for the local development server (not used on Vercel) | No (default `3000`) | `3000` |
| `DATABASE_URL` | Pooled Postgres connection string, used by the app. On Vercel it's set by the Neon integration (with a separate branch for each Preview). | Yes | `postgres://user:pass@ep-xxx-pooler.ap-south-1.aws.neon.tech/sanchari?sslmode=require` |
| `DATABASE_URL_UNPOOLED` | Direct (unpooled) connection string, used for migrations. Set by the Neon integration; locally, the same as `DATABASE_URL`. | Yes (migrations) | `postgres://user:pass@ep-xxx.ap-south-1.aws.neon.tech/sanchari?sslmode=require` |
| `APP_ORIGIN` | The production origin, used for the Origin check | Yes (Production) | `https://sanchari.vercel.app` |
| `CRON_SECRET` | Shared secret for the cleanup cron endpoint; Vercel sends it automatically | Yes (on Vercel) | (random, 32+ characters) |
| `SESSION_TTL_DAYS` | Session lifetime in days | No (default `14`) | `14` |
| `LOG_LEVEL` | pino log level | No (default `info`) | `debug` |
| `TRUST_PROXY` | Trust the `X-Forwarded-For` header from Vercel's edge, which is needed for the correct client IP in rate limiting | No (default `true` when `VERCEL` is set, otherwise `false`) | `true` |

**Provided by Vercel automatically:**
- `VERCEL`
- `VERCEL_ENV` (`production`, `preview`, or `development`)
- `VERCEL_URL` and `VERCEL_BRANCH_URL`. In Preview deployments, the Origin check accepts `https://$VERCEL_URL` and `https://$VERCEL_BRANCH_URL` instead of `APP_ORIGIN`.

## 17. Deployment

### 17.1 Environments
| Environment | Where | Database |
|-------------|-------|----------|
| `development` | Local machine. `pnpm dev` runs Vite and Fastify (`backend/src/server.ts`) side by side, and Vite proxies `/api` to Fastify. | Docker Compose Postgres 17 |
| `preview` | Vercel, one deployment per pull request or non-`main` branch, each with its own URL | A Neon database **branch** created by the integration: a copy of production's data at that moment, isolated from it |
| `production` | Vercel, deployed from `main` at `https://sanchari.vercel.app` | Neon's main branch |

### 17.2 Platform setup
| Piece | Configuration | Purpose |
|-------|---------------|---------|
| Vercel project | Hobby (free) plan; linked to the GitHub repo; the root directory is the repo root | Builds and hosts the frontend and the API |
| Static frontend | Build command: `pnpm build` (builds `shared` → `frontend`). Output directory: `frontend/dist`. | Served from Vercel's CDN |
| Vercel Function | `api/index.ts` wraps the Fastify app from `buildApp()`, following Vercel's Fastify guide. Runs on Node.js 24 with Fluid compute. Region pinned near the database (§13). | Handles all `/api/*` requests |
| Rewrites (`vercel.json`) | `/api/(.*)` → the function. Everything else that isn't a static file → `/index.html` (SPA fallback). | Frontend and API on one origin |
| Headers (`vercel.json`) | CSP, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` on frontend routes; long cache on hashed `/assets/*` | Security and performance |
| Cron (`vercel.json`) | `GET /api/internal/cleanup` once a day (the Hobby plan allows daily cron jobs) | Session and rate-limit cleanup (§12) |
| Neon Postgres | Added through the Vercel Marketplace (Neon integration), Free plan, Postgres 17. Region next to the function region. **Preview branching is turned on.** | The database |
| Domain | `sanchari.vercel.app`, or the closest available `*.vercel.app` name. Free, with HTTPS set up automatically. | Public URL |

**Hobby plan terms:** Vercel's Hobby plan is for **personal, non-commercial use**. If Sanchari ever charges money or is used commercially, upgrade to Vercel Pro (paid).

### 17.3 Cost and free-tier limits
**Expected cost: $0 per month**, with no 6- or 12-month expiry.

| Service | Free-tier limit (approximate, check the current numbers) | Our expected use |
|---------|------------------------------------------------------|------------------|
| Vercel Hobby | Around 100 GB of data transfer a month, and a monthly cap on function invocations and CPU time; Runtime Logs kept for 1 hour; cron jobs at most once a day | A tiny fraction of the limits |
| Neon Free | 0.5–1 GB of storage per project; around 100 compute-hours a month; scales to zero after 5 minutes idle; a 6-hour restore window; 10 branches | Well under 50 MB of data; compute only runs while the app is in use |

These limits change; check vercel.com/docs/limits and neon.com/pricing before launch. If a limit is ever reached, Neon suspends compute until the next month, or Vercel pauses the project. There are no surprise charges, because neither free plan has a payment method attached.

### 17.4 CI/CD
1. **GitHub Actions (`ci.yml`), on every push and PR:** lint, typecheck, unit tests, integration tests (with a Postgres service container), the OpenAPI check, and the build.
2. **Vercel Git integration:** every push gets a Preview deployment; merging to `main` deploys to Production. Vercel deploys on its own, separately from GitHub Actions. To keep a broken build out of production, **protect `main`**: changes reach `main` only through PRs whose CI checks pass.
3. **Rollback:** Vercel's "Instant Rollback" switches Production back to the previous deployment. Database migrations aren't rolled back, which is why they only add things (§17.5).

### 17.5 Database migrations
- In development: change `db/schema.ts`, run `pnpm db:generate`, review the SQL it produces, and commit it.
- On deploy: the Vercel build command runs `pnpm db:migrate` (using `DATABASE_URL_UNPOOLED`) before building. So a Preview migrates its own Neon branch, and Production migrates the main branch when `main` deploys.
- Migrations only add things (no destructive changes without a two-step plan), so that a rolled-back deployment still works with the newer schema.

### 17.6 Backups & restore
- **Point-in-time restore:** Neon's Free plan keeps a 6-hour history, so the database can be restored to any moment in the last 6 hours from the Neon console. This covers "I just broke something".
- **Nightly backup (`backup.yml`):**
  - A scheduled GitHub Actions workflow runs `pg_dump -Fc` against production (using `DATABASE_URL_UNPOOLED`, stored as a repository secret).
  - It encrypts the dump with `gpg --symmetric`, using a passphrase from another secret, and uploads it as a workflow artifact with 30-day retention.
  - The repository must be **private**: even encrypted, the dump contains Users' password hashes.
- **Restore:** documented in `README.md`: download the artifact, decrypt it, then `pg_restore --clean --if-exists` into the target database, or into a new Neon branch to check it first.
- **Restore drill:** test the restore once before launch.
- **Recovery point:** within 6 hours from Neon's history, otherwise up to 24 hours from the nightly dump. That's acceptable for the MVP.

### 17.7 First-time setup
1. Push the repository to a **private** GitHub repo and protect `main` (require the CI checks).
2. In Vercel, import the repo (Hobby plan), set the build command, output directory, and Node.js 24, and choose the project name `sanchari` to get `sanchari.vercel.app`.
3. Add Neon from the Vercel Marketplace (Free plan), pick a region, connect it to the project, and turn on Preview branching. This sets `DATABASE_URL` and `DATABASE_URL_UNPOOLED`.
4. Set `APP_ORIGIN` and `CRON_SECRET` in the Vercel project's Environment Variables, and pin the function region to match Neon's.
5. Deploy `main`. Confirm that the migrations ran, `/api/health/ready` returns `200`, and signup works.
6. Add the backup secrets to GitHub, run `backup.yml` by hand once, and test a restore into a new Neon branch.

## 18. Open Questions
None open. Resolved:
- **Hosting:** Vercel Hobby for the app, plus Neon Free Postgres through the Vercel Marketplace (§17). This replaces the earlier AWS EC2 plan.
- **Domain:** a free `sanchari.vercel.app` subdomain. A custom domain can be added later on Hobby at no extra cost beyond the domain itself.
- **After the free tier:** both free plans have no time limit. Upgrade only if the free-tier limits are reached or the use becomes commercial (§17.2, §17.3).
