import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp } from './helpers';

let t: Awaited<ReturnType<typeof buildTestApp>>;

beforeAll(async () => {
  t = await buildTestApp();
});
afterAll(async () => {
  await t.close();
});

describe('health', () => {
  it('GET /api/health returns ok', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('GET /api/health/ready checks the database', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/health/ready' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('sends an X-Request-Id header', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/health' });
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('error envelope', () => {
  it('unknown routes return NOT_FOUND in the standard shape', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/v1/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: { code: 'NOT_FOUND', message: 'Not found', details: [] } });
  });
});
