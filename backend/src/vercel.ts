// Vercel Function entry point (bundled to dist/vercel.js, re-exported by /api/index.js).
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app';
import { loadConfig } from './config';
import { createDb } from './db/client';

let appPromise: Promise<FastifyInstance> | undefined;

// One app (and one connection pool) per function instance, reused across requests.
function getApp(): Promise<FastifyInstance> {
  appPromise ??= (async () => {
    const config = loadConfig();
    const handle = await createDb(config.DATABASE_URL);
    const app = await buildApp({ config, db: handle.db });
    await app.ready();
    return app;
  })().catch((err: unknown) => {
    appPromise = undefined; // let the next request retry
    throw err;
  });
  return appPromise;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const app = await getApp();
  app.server.emit('request', req, res);
}
