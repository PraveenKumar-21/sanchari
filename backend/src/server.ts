// Local development entry point. On Vercel, src/vercel.ts is used instead.
import { buildApp } from './app';
import { loadConfig } from './config';
import { createDb } from './db/client';
import { migrateDb } from './db/migrate';

const config = loadConfig();
const handle = await createDb(config.DATABASE_URL);

// Embedded PGlite: keep the local database in step with the migrations automatically.
if (handle.kind === 'pglite') await migrateDb(handle);

const app = await buildApp({ config, db: handle.db });

const shutdown = async () => {
  await app.close();
  await handle.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ port: config.PORT, host: '127.0.0.1' });
