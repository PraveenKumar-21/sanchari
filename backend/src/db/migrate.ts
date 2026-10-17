import { fileURLToPath } from 'node:url';
import type { DbHandle } from './client';

const migrationsFolder = fileURLToPath(new URL('./migrations', import.meta.url));

export async function migrateDb(handle: DbHandle): Promise<void> {
  if (handle.kind === 'pglite') {
    const { migrate } = await import('drizzle-orm/pglite/migrator');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await migrate(handle.db as any, { migrationsFolder });
  } else {
    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await migrate(handle.db as any, { migrationsFolder });
  }
}
