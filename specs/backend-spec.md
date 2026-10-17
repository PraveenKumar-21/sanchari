# Backend Spec — Sanchari Trip Planner

> Status: Draft | Owner: Praveen Kumar | Last updated: 2026-10-17
> Related: [goal-spec.md](./goal-spec.md) · [frontend-spec.md](./frontend-spec.md) · [api-contract-spec.md](./api-contract-spec.md)

## 1. Overview
A JSON REST API that stores Users, Sessions, Trips, Destinations, and Activities. It authenticates Users with a session cookie and enforces every business rule in `goal-spec.md` §8; the frontend's checks are a convenience, while the backend is the authority. In production, the same server also serves the built frontend, so the whole app runs on one origin. It's hosted on a single AWS EC2 instance using the AWS Free Tier credits (§17).

The backend does **not** generate PDFs. Itinerary Export happens in the browser (frontend-spec §4.6).

Glossary terms are used exactly as defined in `goal-spec.md` §9.

## 2. Tech Stack
- **Language / runtime:** TypeScript (`strict`) on Node.js 24 LTS
- **Framework:** Fastify 5
- **Validation:** Zod, through `fastify-type-provider-zod`. The schemas live in the `shared/` package and are also used by the frontend (§3.2).
- **API docs:** `@fastify/swagger` generates an OpenAPI document from the Zod schemas, served at `/api/docs` outside production.
- **Database:** PostgreSQL 17
- **ORM / query layer:** Drizzle ORM (type-safe, SQL-like queries)
- **Migrations:** `drizzle-kit`. Generated SQL migration files are committed to the repo.
- **Auth:** our own session-cookie auth: an opaque random token, stored as a hash in Postgres (§7). No auth library or third-party provider.
- **Password hashing:** Argon2id (`@node-rs/argon2`)
- **Security plugins:** `@fastify/cookie`, `@fastify/helmet`, `@fastify/rate-limit`
- **Static frontend (production):** `@fastify/static`
- **Logging:** pino (built into Fastify)
- **Caching:** none in the MVP
- **Background jobs / queues:** none. Expired Sessions are cleaned up by a simple timer (§12).
- **Testing:** Vitest; `fastify.inject()` for HTTP tests against a real Postgres database
- **Package manager:** pnpm workspaces (monorepo: `frontend/`, `backend/`, `shared/`)
- **Hosting:** AWS: one EC2 `t4g.micro` (ARM/Graviton) running Docker Compose (Caddy + app + Postgres), with backups to S3 (§17)
- **Reverse proxy / TLS:** Caddy 2, which gets and renews Let's Encrypt HTTPS certificates automatically

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
Browser ──HTTPS :443──▶ AWS EC2 t4g.micro (Elastic IP, Amazon Linux 2023)
                        └── Docker Compose
                             ├── caddy     :80/:443  HTTPS termination, HTTP → HTTPS redirect
                             │     │ reverse_proxy
                             │     ▼
                             ├── app       :3000 (internal only) Fastify
                             │     ├── /api/v1/*  → API routes
                             │     ├── /api/docs  → OpenAPI UI (disabled in production)
                             │     └── /*         → frontend/dist static files, falling back to index.html for SPA routes
                             │     │
                             │     ▼
                             └── db        :5432 (internal only) PostgreSQL 17, data on the EBS volume
                                   │
                                   ▼ nightly pg_dump
                              S3 bucket (backups, 30-day retention)
```
Because the app is on one origin, the session cookie can be `SameSite=Lax` and no CORS setup is needed. Only Caddy is reachable from the internet; `app` and `db` are on Docker's internal network.

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
- **Per request:** an `authenticate` preHandler hashes the cookie value, looks up a Session that hasn't expired, and sets `request.user = { id, username }`. Otherwise it returns `401 UNAUTHORIZED`. Every route except `POST /auth/signup`, `POST /auth/login`, and `/health` requires it.
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
- **XSS:** the API returns only JSON. The frontend renders Activity text as React text and never as raw HTML (no `dangerouslySetInnerHTML`). `@fastify/helmet` sets a strict Content-Security-Policy for the static frontend.
- **CORS:** disabled, since everything is on one origin. If the frontend is ever hosted separately, allow only `APP_ORIGIN` with `credentials: true`.
- **Rate limiting:**
  - `POST /auth/login`: 10 per minute per IP and username combination
  - `POST /auth/signup`: 5 per hour per IP
  - Everything else: 300 per minute per Session
  - Exceeding a limit returns `429 RATE_LIMITED` with a `Retry-After` header.
- **Secrets management:** only environment variables; `.env` is gitignored, and `.env.example` is committed. The only secret is the Postgres password inside `DATABASE_URL`, because session tokens are random rather than signed. In production it lives in a `.env` file on the instance (`chmod 600`, owned by root) and is never in the image or the repo.
- **Server hardening (EC2):**
  - The security group allows inbound traffic on 80 and 443 only. Port 22 is closed; shell access is through AWS SSM Session Manager.
  - IMDSv2 is required.
  - Automatic OS security updates are on (`dnf-automatic`).
  - The instance's IAM role allows only SSM and `s3:PutObject` to the backup bucket.
- **Body size:** maximum 100 KB per request.
- **OWASP Top 10 notes:**
  - Broken access control is covered by BR-8; each test verifies that one User can't access another's Trip.
  - Weak authentication is covered by Argon2id, rate limits, and identical login errors.
  - Security misconfiguration is covered by helmet, and by turning off `/api/docs` in production.

## 12. Observability
- **Logging:** pino JSON logs with a request ID on every line. `cookie`, `authorization`, `password`, and `set-cookie` are redacted. Log level: `info` in production, `debug` in development (formatted by `pino-pretty`).
- **Log storage:** logs stay on the instance, using Docker's `json-file` driver with rotation (`max-size: 10m`, `max-file: 3`). They are not shipped to CloudWatch Logs, which would cost extra. Read them with `docker compose logs` over SSM.
- **Metrics:** EC2's basic CloudWatch metrics (CPU, network, status checks) are free. One CloudWatch alarm on the system status check triggers EC2 auto-recovery.
- **Health checks:**
  - `GET /health` returns `200 { status: "ok" }` (liveness, no database check)
  - `GET /health/ready` runs `SELECT 1` and returns `200`, or `503` if the database can't be reached
- **Maintenance:** an hourly timer started at boot runs `DELETE FROM sessions WHERE expires_at < now()`.

## 13. Performance & Scalability
- **Expected load:** tiny, under 100 Users and under 1 request per second. A single small instance is plenty.
- **Response size:** `GET /trips/:tripId` returns the whole Itinerary in one response. The worst case (60 days × 50 Activities) is about 3,000 Activities, around 1.5 MB. Typical Trips are a few KB.
- **Query plan:** `getTrip` uses 3 indexed queries (the Trip, its Destinations, its Activities) without joins that would multiply rows. `listTrips` uses 2 queries (the Trips, then all their Destinations, grouped in code).
- **Caching strategy:** none. Postgres is fast enough at this scale.
- **Pagination:** none for Trips (capped at 200 per User by BR-11).
- **Date handling:** the Postgres driver is configured to return `date` columns as strings (Drizzle `date({ mode: 'string' })`). This avoids converting dates to JavaScript `Date` objects in UTC, which can shift them by a day.
- **Connection pool:** `pg.Pool`, with at most 10 connections.
- **Memory budget (1 GiB on t4g.micro):**
  - Postgres: `shared_buffers=128MB`, `max_connections=20`
  - Node: `--max-old-space-size=256`
  - Caddy: about 30 MB
  - A 1 GiB swap file as a safety margin
  - Images are built in CI, not on the instance, because a Vite build could run it out of memory.

## 14. Testing Strategy
- **Unit (Vitest):** the `shared/` validation rules (BR-1 to BR-9, especially the Destination sequence and the 60-day limit), password hashing helpers, session token helpers.
- **Integration (Vitest + `fastify.inject()` + real Postgres):** every endpoint's success path and each error code. Includes:
  - Accessing another User's Trip returns `404` (BR-8)
  - The BR-12 confirm flow, including a rollback when an error happens partway through
  - Reorder with a stale ID list returns `409`
  - Session expiry and sliding renewal
  - Each test file uses a fresh database schema, and every table is truncated between tests.
- **API / contract tests:** responses are checked against the `shared/` Zod schemas in the integration tests. A CI check fails if the generated OpenAPI document no longer matches the copy committed under `backend/openapi.json`, so changes to the contract are visible in code review.
- **Seed / fixture data:** `pnpm db:seed` creates the user `demo` (password `demo-pass-123`) with two Trips: a 5-day, two-Destination Trip with a Travel Day and some Activities, and a 1-day Trip with no Activities. Only for local development.

## 15. Folder Structure
```
/ (repo root)
  package.json              # pnpm workspace scripts: dev, build, test, lint
  pnpm-workspace.yaml       # frontend, backend, shared
  docker-compose.yml        # local Postgres 17 (dev and test databases)
  deploy/
    docker-compose.prod.yml # caddy + app + db, with log rotation and healthchecks
    Caddyfile               # {$DOMAIN} { reverse_proxy app:3000 }
    backup.sh               # pg_dump → S3
    sanchari-backup.service # systemd unit + timer (nightly)
    sanchari-backup.timer
    README.md               # first-time server setup and restore runbook
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
    Dockerfile
    src/
      server.ts             # entry point: buildApp() + listen
      app.ts                # buildApp(): registers plugins and routes (also used by tests)
      config.ts             # loads and validates environment variables with Zod
      db/
        schema.ts           # Drizzle table definitions
        client.ts           # pg Pool + drizzle instance
        migrations/         # generated SQL (committed)
        seed.ts
      plugins/
        auth.ts
        errors.ts
        security.ts
      modules/
        auth/               # auth.routes.ts, auth.service.ts
        trips/              # trips.routes.ts, trips.service.ts
        activities/         # activities.routes.ts, activities.service.ts
        health/             # health.routes.ts
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
| `PORT` | Port the HTTP server listens on | No (default `3000`) | `3000` |
| `DATABASE_URL` | Postgres connection string | Yes | `postgres://sanchari:secret@localhost:5432/sanchari` |
| `APP_ORIGIN` | The public origin, used for the Origin check | Yes | `https://sanchari.example.com` |
| `SESSION_TTL_DAYS` | Session lifetime in days | No (default `14`) | `14` |
| `LOG_LEVEL` | pino log level | No (default `info`) | `debug` |
| `TRUST_PROXY` | Trust the `X-Forwarded-*` headers set by Caddy (needed for the correct client IP in rate limiting, and for secure cookies). `true` in production. | No (default `false`) | `true` |
| `STATIC_DIR` | Path to the built frontend served in production | No (default `../frontend/dist`) | `/app/frontend/dist` |

**Production only (`deploy/.env` on the instance, read by Docker Compose and Caddy):**
| Variable | Description | Example |
|----------|-------------|---------|
| `DOMAIN` | Public hostname that Caddy gets a certificate for | `sanchari.duckdns.org` |
| `POSTGRES_PASSWORD` | Password for the `db` container; also part of `DATABASE_URL` | (random, 32+ characters) |
| `BACKUP_BUCKET` | S3 bucket that receives the nightly dumps | `sanchari-backups-123456789012` |
| `IMAGE_TAG` | Git SHA of the app image to run | `bd75033` |

## 17. Deployment
### 17.1 Environments
- `development`: local machine. Docker Compose runs Postgres, `pnpm dev` runs Vite and Fastify side by side, and Vite proxies `/api` to Fastify.
- `production`: a single EC2 instance on AWS (§3.3).
- No staging environment in the MVP.

### 17.2 AWS resources
| Resource | Configuration | Purpose |
|----------|---------------|---------|
| EC2 instance | `t4g.micro` (2 vCPU ARM, 1 GiB), Amazon Linux 2023 arm64, Docker + Compose plugin | Runs Caddy, the app, and Postgres |
| EBS volume | 20 GiB gp3 root volume, `DeleteOnTermination=false` | OS, Docker images, Postgres data |
| Elastic IP | 1 address, attached to the instance | A stable address for DNS |
| Security group | Inbound: TCP 80 and 443 from anywhere. Outbound: all. | Only web traffic can reach the server |
| IAM instance role | `AmazonSSMManagedInstanceCore` + `s3:PutObject` on the backup bucket | Shell and deploys through SSM; backups |
| S3 bucket | Private, all public access blocked, SSE-S3 encryption, lifecycle rule deleting objects after 30 days | Nightly database backups |
| IAM role for GitHub OIDC | Can run `ssm:SendCommand` on this instance only | Deploys from CI without long-lived AWS keys |
| AWS Budgets | Alerts at $5 and $15 of monthly cost | No surprise bills (also one of the onboarding tasks that earns credits) |
| CloudWatch alarm | On a failed EC2 system status check, run auto-recover | Recovers automatically from a hardware failure |

- **Region:** the one closest to most Users (e.g. `ap-south-1` Mumbai). Everything lives in the same region.
- **Domain:** a hostname is required, because Caddy needs one to get a Let's Encrypt certificate, and cookies need HTTPS to be `Secure`. Use a free DuckDNS subdomain for the MVP, or a purchased domain with an A record pointing at the Elastic IP.

### 17.3 Cost (AWS Free Tier credits)
New AWS accounts (since 15 July 2025) receive $100 in credits, plus up to $100 more for completing onboarding tasks. EC2 and EBS usage is paid from these credits, not free on its own.

| Item | Approximate monthly cost |
|------|-------------------------|
| EC2 `t4g.micro`, running all month | ~$6 |
| Public IPv4 address (Elastic IP) | ~$3.60 |
| EBS 20 GiB gp3 | ~$1.60 |
| S3 backups (well under 1 GB) | < $0.05 |
| Data transfer out (the first 100 GB/month are always free) | $0 |
| **Total** | **~$11/month, paid from credits** |

These figures use approximate us-east-1 prices and vary slightly by region. Before the Free plan ends (reportedly 6 months, or when the credits run out), either upgrade the account to the Paid plan (~$11/month), or move elsewhere. The containerized setup runs unchanged on any host with Docker. **On the Free plan, AWS deletes a closed account's data, including the S3 backups, so download a final backup first.**

### 17.4 Containerization
- **App image:** a multi-stage `Dockerfile` that installs the workspace, builds `shared`, `frontend`, and `backend`, then copies only the production dependencies and build output into a small `node:24-slim` image. It runs as a non-root user and is built for `linux/arm64`, to match Graviton.
- **`deploy/docker-compose.prod.yml`:**
  - `caddy:2-alpine`: ports 80 and 443; volumes for certificate storage
  - `app`: `ghcr.io/<owner>/sanchari:${IMAGE_TAG}`; healthcheck on `/health/ready`; `restart: unless-stopped`
  - `postgres:17-alpine`: named volume for its data; healthcheck with `pg_isready`; not published to the host
  - The `app` container starts only after `db` reports healthy.

### 17.5 CI/CD (GitHub Actions)
1. **On every push or PR:** lint, typecheck, unit tests, integration tests (with a Postgres service container), the OpenAPI check, and the build.
2. **On push to `main`, if everything passes:**
   - Build the `linux/arm64` image with `docker buildx` and push it to GitHub Container Registry, tagged with the git SHA.
   - Assume the deploy role through GitHub OIDC (no stored AWS keys).
   - Use `aws ssm send-command` to run on the instance: `cd /opt/sanchari && IMAGE_TAG=<sha> docker compose pull app && docker compose up -d app`.
3. **Rollback:** run the same deploy command with the previous SHA.
4. Expect a few seconds of downtime while the `app` container restarts; acceptable for the MVP.

### 17.6 Database migrations
- In development: change `db/schema.ts`, run `pnpm db:generate`, review the SQL it produces, and commit it.
- On deploy: the `app` container runs `pnpm db:migrate` before starting the server.
- Migrations only add things (no destructive changes without a two-step plan).

### 17.7 Backups & restore
- **Nightly backup:** a systemd timer at 02:00 local time runs `deploy/backup.sh`:
  `docker compose exec -T db pg_dump -Fc -U sanchari sanchari | aws s3 cp - s3://$BACKUP_BUCKET/sanchari-$(date +%F).dump`
- **Retention:** 30 days, through the S3 lifecycle rule.
- **Restore:** documented in `deploy/README.md`: download a dump, then `pg_restore --clean --if-exists` into the `db` container.
- **Restore drill:** test the restore once before launch.
- **Recovery point:** up to 24 hours of data can be lost. That's acceptable for the MVP.

### 17.8 First-time server setup
Documented step by step in `deploy/README.md`:
1. Create the AWS resources in §17.2 (by hand in the console for the MVP; infrastructure-as-code is post-MVP).
2. Through SSM: install Docker and the Compose plugin, create the swap file, and enable `dnf-automatic`.
3. Copy `deploy/` to `/opt/sanchari` and create `deploy/.env` (§16).
4. Point the domain at the Elastic IP, run `docker compose up -d`, and confirm Caddy obtained a certificate.
5. Enable the backup timer and run one backup by hand to verify it.

## 18. Open Questions
- **Domain:** a free DuckDNS subdomain, or buy a domain? Needed before the first deploy (§17.2).
- **After the Free plan:** upgrade the AWS account to Paid (~$11/month), or move the containers elsewhere? Decide before the credits or the Free plan run out (§17.3).
