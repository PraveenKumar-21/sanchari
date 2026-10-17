// Bundles the Vercel Function entry (and the shared/ package) into dist/vercel.js.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/vercel.ts'],
  outfile: 'dist/vercel.js',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: 'linked',
  // Native or dev-only modules stay external; Vercel traces them from node_modules.
  external: ['@node-rs/argon2', '@electric-sql/pglite', 'pg-native', 'pino-pretty'],
  // Bundled CommonJS dependencies (pg, fastify internals) call require() on Node built-ins.
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
  logLevel: 'info',
});
