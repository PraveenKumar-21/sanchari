import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp, type TestApp } from './helpers';

let t: TestApp;
let alice: string;
let bob: string;
let tripId: string;

beforeAll(async () => {
  t = await buildTestApp();
  alice = (await t.signup('alice')).token;
  bob = (await t.signup('bob')).token;
});
afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  const res = await t.request({
    method: 'POST',
    url: '/api/v1/trips',
    cookie: alice,
    payload: {
      name: 'Japan Spring',
      tripType: 'couple',
      destinations: [
        { name: 'Kyoto', startDate: '2027-03-12', endDate: '2027-03-14' },
        { name: 'Osaka', startDate: '2027-03-14', endDate: '2027-03-16' },
      ],
    },
  });
  tripId = res.json().data.id;
});

const add = (body: object, token = alice) =>
  t.request({
    method: 'POST',
    url: `/api/v1/trips/${tripId}/activities`,
    cookie: token,
    payload: body,
  });

async function dayTexts(date: string) {
  const res = await t.request({ method: 'GET', url: `/api/v1/trips/${tripId}`, cookie: alice });
  return res
    .json()
    .data.activities.filter((a: { date: string }) => a.date === date)
    .map((a: { text: string; position: number }) => `${a.position}:${a.text}`);
}

describe('POST /trips/:tripId/activities', () => {
  it('appends by default and inserts at a position, shifting later ones', async () => {
    const first = await add({ date: '2027-03-13', text: '  Fushimi Inari  ' });
    expect(first.statusCode).toBe(201);
    expect(first.json().data).toMatchObject({
      date: '2027-03-13',
      position: 0,
      text: 'Fushimi Inari',
    });

    await add({ date: '2027-03-13', text: 'Nishiki Market' });
    const inserted = await add({ date: '2027-03-13', text: 'Philosopher’s Path', position: 1 });
    expect(inserted.json().data.position).toBe(1);
    await add({ date: '2027-03-13', text: 'Gion at night', position: 99 }); // clamped to end

    expect(await dayTexts('2027-03-13')).toEqual([
      '0:Fushimi Inari',
      '1:Philosopher’s Path',
      '2:Nishiki Market',
      '3:Gion at night',
    ]);
  });

  it('rejects a date outside the Trip (BR-10) and multi-line text (BR-9)', async () => {
    const outside = await add({ date: '2027-03-17', text: 'Too late' });
    expect(outside.statusCode).toBe(400);
    expect(outside.json().error.details[0].path).toBe('date');

    const multiline = await add({ date: '2027-03-13', text: 'one\ntwo' });
    expect(multiline.statusCode).toBe(400);
    expect(multiline.json().error.details[0].path).toBe('text');
  });

  it('allows at most 50 Activities per date (BR-11)', async () => {
    for (let i = 0; i < 50; i++) {
      expect((await add({ date: '2027-03-12', text: `Item ${i}` })).statusCode).toBe(201);
    }
    const res = await add({ date: '2027-03-12', text: 'One too many' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatchObject({
      code: 'LIMIT_REACHED',
      details: [{ limit: 'activitiesPerDate', max: 50 }],
    });
  });

  it("returns 404 for another User's Trip", async () => {
    const res = await add({ date: '2027-03-13', text: 'Sneaky' }, bob);
    expect(res.statusCode).toBe(404);
  });
});

describe('PATCH and DELETE /trips/:tripId/activities/:activityId', () => {
  it('edits text', async () => {
    const created = (await add({ date: '2027-03-13', text: 'Fushimi Inari' })).json().data;
    const res = await t.request({
      method: 'PATCH',
      url: `/api/v1/trips/${tripId}/activities/${created.id}`,
      cookie: alice,
      payload: { text: 'Fushimi Inari at sunrise' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.text).toBe('Fushimi Inari at sunrise');
    expect(res.json().data.position).toBe(0);
  });

  it('deletes and keeps the remaining positions contiguous', async () => {
    const ids: string[] = [];
    for (const text of ['A', 'B', 'C']) {
      ids.push((await add({ date: '2027-03-14', text })).json().data.id);
    }
    const res = await t.request({
      method: 'DELETE',
      url: `/api/v1/trips/${tripId}/activities/${ids[1]}`,
      cookie: alice,
    });
    expect(res.statusCode).toBe(204);
    expect(await dayTexts('2027-03-14')).toEqual(['0:A', '1:C']);

    const again = await t.request({
      method: 'DELETE',
      url: `/api/v1/trips/${tripId}/activities/${ids[1]}`,
      cookie: alice,
    });
    expect(again.statusCode).toBe(404);
  });

  it('restores a deleted Activity at its old position (Undo)', async () => {
    const ids: string[] = [];
    for (const text of ['A', 'B', 'C']) {
      ids.push((await add({ date: '2027-03-14', text })).json().data.id);
    }
    await t.request({
      method: 'DELETE',
      url: `/api/v1/trips/${tripId}/activities/${ids[1]}`,
      cookie: alice,
    });
    await add({ date: '2027-03-14', text: 'B', position: 1 });
    expect(await dayTexts('2027-03-14')).toEqual(['0:A', '1:B', '2:C']);
  });

  it("returns 404 for another User's Activity and for an Activity in a different Trip", async () => {
    const created = (await add({ date: '2027-03-13', text: 'Mine' })).json().data;
    const asBob = await t.request({
      method: 'PATCH',
      url: `/api/v1/trips/${tripId}/activities/${created.id}`,
      cookie: bob,
      payload: { text: 'Hijacked' },
    });
    expect(asBob.statusCode).toBe(404);

    const other = await t.request({
      method: 'POST',
      url: '/api/v1/trips',
      cookie: alice,
      payload: {
        name: 'Other',
        tripType: 'solo',
        destinations: [{ name: 'Goa', startDate: '2027-05-01', endDate: '2027-05-02' }],
      },
    });
    const wrongTrip = await t.request({
      method: 'DELETE',
      url: `/api/v1/trips/${other.json().data.id}/activities/${created.id}`,
      cookie: alice,
    });
    expect(wrongTrip.statusCode).toBe(404);
  });
});

describe('PUT /trips/:tripId/days/:date/activity-order', () => {
  it('reorders the Activities on a date', async () => {
    const ids: string[] = [];
    for (const text of ['A', 'B', 'C']) {
      ids.push((await add({ date: '2027-03-15', text })).json().data.id);
    }
    const res = await t.request({
      method: 'PUT',
      url: `/api/v1/trips/${tripId}/days/2027-03-15/activity-order`,
      cookie: alice,
      payload: { activityIds: [ids[2], ids[0], ids[1]] },
    });
    expect(res.statusCode).toBe(200);
    expect(
      res.json().data.map((a: { text: string; position: number }) => `${a.position}:${a.text}`),
    ).toEqual(['0:C', '1:A', '2:B']);
  });

  it('rejects a stale list with CONFLICT (BR-13)', async () => {
    const a = (await add({ date: '2027-03-15', text: 'A' })).json().data.id;
    await add({ date: '2027-03-15', text: 'B (added in another tab)' });
    const res = await t.request({
      method: 'PUT',
      url: `/api/v1/trips/${tripId}/days/2027-03-15/activity-order`,
      cookie: alice,
      payload: { activityIds: [a] },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('CONFLICT');
  });

  it('rejects duplicate ids and dates outside the Trip with VALIDATION_ERROR', async () => {
    const a = (await add({ date: '2027-03-15', text: 'A' })).json().data.id;
    const dup = await t.request({
      method: 'PUT',
      url: `/api/v1/trips/${tripId}/days/2027-03-15/activity-order`,
      cookie: alice,
      payload: { activityIds: [a, a] },
    });
    expect(dup.statusCode).toBe(400);

    const outside = await t.request({
      method: 'PUT',
      url: `/api/v1/trips/${tripId}/days/2027-04-01/activity-order`,
      cookie: alice,
      payload: { activityIds: [a] },
    });
    expect(outside.statusCode).toBe(400);
    expect(outside.json().error.details[0].path).toBe('params.date');

    const badDate = await t.request({
      method: 'PUT',
      url: `/api/v1/trips/${tripId}/days/2027-02-30/activity-order`,
      cookie: alice,
      payload: { activityIds: [a] },
    });
    expect(badDate.statusCode).toBe(400);
    expect(badDate.json().error.details[0].path).toBe('params.date');
  });
});
