// Applies pending migrations. Uses the direct (unpooled) connection when available (backend-spec §17.5).
import { createDb } from '../src/db/client';
import { migrateDb } from '../src/db/migrate';

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.error('db:migrate: DATABASE_URL_UNPOOLED or DATABASE_URL must be set');
  process.exit(1);
}

const handle = await createDb(url);
try {
  await migrateDb(handle);
  console.log(`db:migrate: migrations applied (${handle.kind})`);
} finally {
  await handle.close();
}
