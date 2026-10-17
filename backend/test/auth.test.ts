import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sessions } from '../src/db/schema';
import { hashSessionToken } from '../src/lib/session-token';
import { buildTestApp, sessionCookie, sessionToken, type TestApp } from './helpers';

let t: TestApp;
beforeAll(async () => {
  t = await buildTestApp();
});
afterAll(async () => {
  await t.close();
});

const DAY_MS = 86_400_000;

describe('POST /api/v1/auth/signup', () => {
  it('creates the Account, lowercases the username and sets a secure session cookie', async () => {
    const res = await t.request({
      method: 'POST',
      url: '/api/v1/auth/signup',
      payload: { username: 'Praveen_K', password: 'correct-horse-battery' },
    });
    expect(res.statusCode).toBe(201);
    const { data } = res.json();
    expect(data).toMatchObject({ username: 'praveen_k' });
    expect(data).not.toHaveProperty('passwordHash');
    expect(Object.keys(data).sort()).toEqual(['createdAt', 'id', 'username']);

    const cookie = sessionCookie(res)!;
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe('Lax');
    expect(cookie.path).toBe('/');
    expect(cookie.maxAge).toBe(14 * 86_400);
  });

  it('rejects a taken username case-insensitively (USERNAME_TAKEN)', async () => {
    await t.signup('takenname');
    const res = await t.request({
      method: 'POST',
      url: '/api/v1/auth/signup',
      payload: { username: 'TakenName', password: 'correct-horse-battery' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('USERNAME_TAKEN');
  });

  it('reports field paths for invalid input', async () => {
    const res = await t.request({
      method: 'POST',
      url: '/api/v1/auth/signup',
      payload: { username: 'a b', password: 'short' },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details.map((d: { path: string }) => d.path).sort()).toEqual([
      'password',
      'username',
    ]);
  });

  it('rejects unknown fields', async () => {
    const res = await t.request({
      method: 'POST',
      url: '/api/v1/auth/signup',
      payload: { username: 'extrafield', password: 'correct-horse-battery', admin: true },
    });
    expect(res.statusCode).toBe(400);
  });

  it('is limited to 5 per hour per IP (RATE_LIMITED)', async () => {
    const remoteAddress = '192.0.2.10';
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await t.request({
        method: 'POST',
        url: '/api/v1/auth/signup',
        remoteAddress,
        payload: { username: `ratelimit${i}`, password: 'correct-horse-battery' },
      });
      codes.push(res.statusCode);
      if (i === 5) {
        expect(res.json().error.code).toBe('RATE_LIMITED');
        expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
        expect(res.headers['x-ratelimit-remaining']).toBe('0');
      }
    }
    expect(codes).toEqual([201, 201, 201, 201, 201, 429]);
  });
});

describe('POST /api/v1/auth/login', () => {
  it('logs in with the right password, any username case', async () => {
    await t.signup('loginuser', 'correct-horse-battery');
    const res = await t.request({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { username: 'LoginUser', password: 'correct-horse-battery' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.username).toBe('loginuser');
    expect(sessionToken(res)).toBeTruthy();
  });

  it('gives the same INVALID_CREDENTIALS for a wrong password and an unknown username', async () => {
    await t.signup('wrongpass', 'correct-horse-battery');
    const wrong = await t.request({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { username: 'wrongpass', password: 'not-the-password' },
    });
    const unknown = await t.request({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { username: 'nobody-here', password: 'not-the-password' },
    });
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrong.json()).toEqual(unknown.json());
    expect(wrong.json().error.code).toBe('INVALID_CREDENTIALS');
  });

  it('is limited to 10 per minute per IP and username', async () => {
    const remoteAddress = '192.0.2.20';
    const codes: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await t.request({
        method: 'POST',
        url: '/api/v1/auth/login',
        remoteAddress,
        payload: { username: 'bruteforce', password: 'guess' },
      });
      codes.push(res.statusCode);
    }
    expect(codes.slice(0, 10).every((c) => c === 401)).toBe(true);
    expect(codes[10]).toBe(429);
  });
});

describe('Sessions', () => {
  it('GET /me returns the User with a Session and 401 without one', async () => {
    const { token } = await t.signup('meuser');
    const me = await t.request({ method: 'GET', url: '/api/v1/auth/me', cookie: token });
    expect(me.statusCode).toBe(200);
    expect(me.json().data.username).toBe('meuser');
    expect(sessionCookie(me)).toBeUndefined(); // fresh Session: no renewal

    const anon = await t.request({ method: 'GET', url: '/api/v1/auth/me' });
    expect(anon.statusCode).toBe(401);
    expect(anon.json().error.code).toBe('UNAUTHORIZED');
  });

  it('logout ends the Session and clears the cookie', async () => {
    const { token } = await t.signup('logoutuser');
    const out = await t.request({ method: 'POST', url: '/api/v1/auth/logout', cookie: token });
    expect(out.statusCode).toBe(204);
    expect(sessionCookie(out)?.value).toBe('');

    const me = await t.request({ method: 'GET', url: '/api/v1/auth/me', cookie: token });
    expect(me.statusCode).toBe(401);

    const again = await t.request({ method: 'POST', url: '/api/v1/auth/logout' });
    expect(again.statusCode).toBe(204);
  });

  it('rejects an expired Session', async () => {
    const { token } = await t.signup('expireduser');
    await t.db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sessions.id, hashSessionToken(token)));
    const me = await t.request({ method: 'GET', url: '/api/v1/auth/me', cookie: token });
    expect(me.statusCode).toBe(401);
  });

  it('slides the expiry when less than half the lifetime remains', async () => {
    const { token } = await t.signup('slidinguser');
    await t.db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() + 2 * DAY_MS) })
      .where(eq(sessions.id, hashSessionToken(token)));

    const me = await t.request({ method: 'GET', url: '/api/v1/auth/me', cookie: token });
    expect(me.statusCode).toBe(200);
    expect(sessionCookie(me)?.value).toBe(token);

    const [row] = await t.db
      .select()
      .from(sessions)
      .where(eq(sessions.id, hashSessionToken(token)));
    expect(row!.expiresAt.getTime()).toBeGreaterThan(Date.now() + 13 * DAY_MS);
  });

  it('stores only the hash of the token', async () => {
    const { token } = await t.signup('hashuser');
    const rows = await t.db.select().from(sessions);
    expect(rows.some((r) => r.id === token)).toBe(false);
    expect(rows.some((r) => r.id === hashSessionToken(token))).toBe(true);
  });
});

describe('request guards', () => {
  it('rejects state-changing requests from another Origin (FORBIDDEN)', async () => {
    const res = await t.request({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin: 'https://evil.example' },
      payload: { username: 'x', password: 'y' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FORBIDDEN');
  });

  it('accepts a same-origin request on any host the app is served from', async () => {
    const res = await t.request({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: {
        host: 'sanchari-git-main-team.vercel.app',
        origin: 'http://sanchari-git-main-team.vercel.app',
      },
    });
    expect(res.statusCode).toBe(204);
  });

  it('rejects an Origin for a different host', async () => {
    const res = await t.request({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { host: 'sanchari.example', origin: 'https://sanchari.example.evil.test' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('rejects requests without an Origin header', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
    });
    expect(res.statusCode).toBe(403);
  });

  it('rejects non-JSON bodies (UNSUPPORTED_MEDIA_TYPE)', async () => {
    const res = await t.request({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'content-type': 'text/plain' },
      payload: 'username=x',
    });
    expect(res.statusCode).toBe(415);
    expect(res.json().error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('rejects malformed JSON with VALIDATION_ERROR', async () => {
    const res = await t.request({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: '{"username":',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });
});
