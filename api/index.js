// Vercel Function: every /api/* request is rewritten here (see vercel.json).
// The Fastify app is bundled by `pnpm --filter backend build` (backend/scripts/build.mjs).
export { default } from '../backend/dist/vercel.js';
