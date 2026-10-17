import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import { createDb } from '../src/db/client';
import { migrateDb } from '../src/db/migrate';

/** A fully migrated app on an in-memory PGlite database. Call `close()` in afterAll. */
export async function buildTestApp() {
  const config = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: 'pglite://memory',
    APP_ORIGIN: 'http://localhost:5173',
  });
  const handle = await createDb(config.DATABASE_URL);
  await migrateDb(handle);
  const app = await buildApp({ config, db: handle.db });
  await app.ready();
  return {
    app,
    db: handle.db,
    close: async () => {
      await app.close();
      await handle.close();
    },
  };
}
