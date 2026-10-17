import type { InjectOptions, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import { createDb } from '../src/db/client';
import { migrateDb } from '../src/db/migrate';
import { SESSION_COOKIE } from '../src/lib/session-token';

export const TEST_ORIGIN = 'http://localhost:5173';

let ipCounter = 0;
/** A distinct client IP, so rate limits in one test don't leak into another. */
export const nextIp = () => `10.0.${Math.floor(++ipCounter / 250)}.${(ipCounter % 250) + 1}`;

/** A fully migrated app on an in-memory PGlite database. Call `close()` in afterAll. */
export async function buildTestApp() {
  const config = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: 'pglite://memory',
    APP_ORIGIN: TEST_ORIGIN,
  });
  const handle = await createDb(config.DATABASE_URL);
  await migrateDb(handle);
  const app = await buildApp({ config, db: handle.db });
  await app.ready();

  /** inject() with the allowed Origin and a fresh client IP unless overridden. */
  const request = (opts: InjectOptions & { cookie?: string }) => {
    const { cookie, headers, ...rest } = opts;
    return app.inject({
      remoteAddress: nextIp(),
      ...rest,
      headers: {
        origin: TEST_ORIGIN,
        ...(cookie && { cookie: `${SESSION_COOKIE}=${cookie}` }),
        ...headers,
      },
    });
  };

  /** Signs up a User and returns their session token. */
  const signup = async (username = `user${++ipCounter}`, password = 'correct-horse-battery') => {
    const res = await request({
      method: 'POST',
      url: '/api/v1/auth/signup',
      payload: { username, password },
    });
    if (res.statusCode !== 201) throw new Error(`signup failed: ${res.statusCode} ${res.body}`);
    return { token: sessionToken(res)!, user: res.json().data as { id: string; username: string } };
  };

  return {
    app,
    db: handle.db,
    request,
    signup,
    close: async () => {
      await app.close();
      await handle.close();
    },
  };
}

export type TestApp = Awaited<ReturnType<typeof buildTestApp>>;

/** The session token from a response's Set-Cookie, if any. */
export function sessionToken(res: LightMyRequestResponse): string | undefined {
  const cookie = res.cookies.find((c) => c.name === SESSION_COOKIE);
  return cookie?.value || undefined;
}

export function sessionCookie(res: LightMyRequestResponse) {
  return res.cookies.find((c) => c.name === SESSION_COOKIE);
}
