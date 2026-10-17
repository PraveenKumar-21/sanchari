import { mkdirSync } from 'node:fs';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema';

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export type DbHandle = {
  db: Db;
  kind: 'pg' | 'pglite';
  close: () => Promise<void>;
};

const PGLITE_PREFIX = 'pglite://';

/**
 * Connects to Postgres. `pglite://memory` and `pglite://<dir>` use embedded PGlite
 * (local development and tests); anything else is a regular Postgres URL (Neon in production).
 */
export async function createDb(url: string): Promise<DbHandle> {
  if (url.startsWith(PGLITE_PREFIX)) {
    const location = url.slice(PGLITE_PREFIX.length);
    const { PGlite } = await import('@electric-sql/pglite');
    const { drizzle } = await import('drizzle-orm/pglite');
    let dataDir: string | undefined;
    if (location !== 'memory') {
      mkdirSync(location, { recursive: true });
      dataDir = location;
    }
    const client = new PGlite(dataDir);
    return {
      db: drizzle(client, { schema }) as unknown as Db,
      kind: 'pglite',
      close: () => client.close(),
    };
  }

  const { Pool } = await import('pg');
  const { drizzle } = await import('drizzle-orm/node-postgres');
  // Small pool: one per function instance, behind Neon's PgBouncer (backend-spec §13).
  const pool = new Pool({ connectionString: url, max: 5, idleTimeoutMillis: 10_000 });
  return {
    db: drizzle(pool, { schema }) as unknown as Db,
    kind: 'pg',
    close: () => pool.end(),
  };
}
