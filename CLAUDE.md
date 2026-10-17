# Sanchari — Trip Planner

Spec-driven project. **The specs in `specs/` are the source of truth**:

- `goal-spec.md`: product scope, feature IDs (F-x), use cases (UC-x), glossary
- `frontend-spec.md`, `backend-spec.md`: design; business rules are BR-x in backend §6
- `api-contract-spec.md`: the REST contract (its code form is the Zod schemas in `shared/src/schemas/`)
- `implementation-plan.md`: the current phases, the V1 deviations from the specs, and the cut list

## Rules

- If the code needs to differ from a spec, update the spec in the same commit, or record it in `implementation-plan.md` §3.1.
- Use the glossary terms from goal-spec §9 (Trip, Destination, Day, Day Number, Travel Day, Activity, …) in code and UI text.
- Calendar dates are `YYYY-MM-DD` strings everywhere. Never `new Date('YYYY-MM-DD')`; use the helpers in `shared/`.
- Validation rules live once, in `shared/`, and are used by both the frontend and the backend.
- Commit messages name the spec IDs they implement (e.g. `F-5, BR-13`).

## Layout

pnpm workspace: `shared/` (Zod schemas, types, date rules; used from source), `backend/` (Fastify + Drizzle), `frontend/` (Vite + React + shadcn/ui), `api/index.js` (Vercel Function entry → `backend/dist/vercel.js`).

## Commands

- `pnpm dev`: backend on :3000 and frontend on :5173 (Vite proxies `/api`)
- `pnpm lint && pnpm typecheck && pnpm test && pnpm build`: the full check (same as CI)
- `pnpm db:generate`: create a migration after changing `backend/src/db/schema.ts`; commit the SQL it produces
- `pnpm db:migrate`: apply migrations (Vercel runs this during its build)

The local database defaults to embedded PGlite in `.data/` (see `.env.example`); tests use in-memory PGlite. Node 22 and pnpm 10.
