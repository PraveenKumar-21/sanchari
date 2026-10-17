import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { rateLimits, sessions } from '../src/db/schema';
import { hashSessionToken } from '../src/lib/session-token';
import { buildTestApp, TEST_CRON_SECRET, type TestApp } from './helpers';

let t: TestApp;
beforeAll(async () => {
  t = await buildTestApp();
});
afterAll(async () => {
  await t.close();
});

describe('GET /api/internal/cleanup', () => {
  it('is hidden without the cron secret', async () => {
    for (const authorization of [undefined, 'Bearer wrong', `Bearer ${TEST_CRON_SECRET}x`]) {
      const res = await t.request({
        method: 'GET',
        url: '/api/internal/cleanup',
        headers: authorization ? { authorization } : {},
      });
      expect(res.statusCode).toBe(404);
    }
  });

  it('deletes expired Sessions and stale rate-limit rows only', async () => {
    const expired = await t.signup('expiredcron');
    const active = await t.signup('activecron');
    await t.db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sessions.id, hashSessionToken(expired.token)));
    await t.db.insert(rateLimits).values([
      { key: 'login:old', windowStart: new Date(Date.now() - 2 * 86_400_000), count: 3 },
      { key: 'login:fresh', windowStart: new Date(), count: 1 },
    ]);

    const res = await t.request({
      method: 'GET',
      url: '/api/internal/cleanup',
      headers: { authorization: `Bearer ${TEST_CRON_SECRET}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().deleted.sessions).toBe(1);

    const keys = (await t.db.select().from(rateLimits)).map((r) => r.key);
    expect(keys).toContain('login:fresh');
    expect(keys).not.toContain('login:old');
    const me = await t.request({ method: 'GET', url: '/api/v1/auth/me', cookie: active.token });
    expect(me.statusCode).toBe(200);
  });
});
