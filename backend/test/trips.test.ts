import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { activities, destinations } from '../src/db/schema';
import { buildTestApp, type TestApp } from './helpers';

let t: TestApp;
let alice: string;
let bob: string;

beforeAll(async () => {
  t = await buildTestApp();
  alice = (await t.signup('alice')).token;
  bob = (await t.signup('bob')).token;
});
afterAll(async () => {
  await t.close();
});

const japan = {
  name: 'Japan Spring',
  tripType: 'couple',
  destinations: [
    { name: 'Kyoto', startDate: '2027-03-12', endDate: '2027-03-14' },
    { name: 'Osaka', startDate: '2027-03-14', endDate: '2027-03-16' },
  ],
};

async function createTrip(token: string, body: object = japan) {
  const res = await t.request({
    method: 'POST',
    url: '/api/v1/trips',
    cookie: token,
    payload: body,
  });
  expect(res.statusCode).toBe(201);
  return res.json().data as { id: string; [k: string]: unknown };
}

async function addActivity(tripId: string, date: string, text: string, position = 0) {
  await t.db.insert(activities).values({ tripId, date, text, position });
}

describe('POST /api/v1/trips', () => {
  it('creates a Trip with derived dates, sorted Destinations and a Location header', async () => {
    const res = await t.request({
      method: 'POST',
      url: '/api/v1/trips',
      cookie: alice,
      payload: { ...japan, destinations: [...japan.destinations].reverse() },
    });
    expect(res.statusCode).toBe(201);
    const trip = res.json().data;
    expect(trip).toMatchObject({
      name: 'Japan Spring',
      tripType: 'couple',
      startDate: '2027-03-12',
      endDate: '2027-03-16',
      dayCount: 5,
      activities: [],
    });
    expect(trip.destinations.map((d: { name: string }) => d.name)).toEqual(['Kyoto', 'Osaka']);
    expect(res.headers.location).toBe(`/api/v1/trips/${trip.id}`);
  });

  it('reports sequence errors at the sorted index', async () => {
    const res = await t.request({
      method: 'POST',
      url: '/api/v1/trips',
      cookie: alice,
      payload: {
        ...japan,
        destinations: [
          { name: 'Osaka', startDate: '2027-03-16', endDate: '2027-03-18' },
          { name: 'Kyoto', startDate: '2027-03-12', endDate: '2027-03-14' },
        ],
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.details).toEqual([
      { path: 'destinations.1.startDate', message: 'Must start on 2027-03-14 or 2027-03-15' },
    ]);
  });

  it('requires a Session', async () => {
    const res = await t.request({ method: 'POST', url: '/api/v1/trips', payload: japan });
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /api/v1/trips', () => {
  it('lists only my Trips, ordered by start date', async () => {
    const carol = (await t.signup('carol')).token;
    await createTrip(carol, {
      ...japan,
      name: 'Later',
      destinations: [{ name: 'Goa', startDate: '2027-12-01', endDate: '2027-12-03' }],
    });
    await createTrip(carol, { ...japan, name: 'Sooner' });
    await createTrip(bob, { ...japan, name: "Bob's trip" });

    const res = await t.request({ method: 'GET', url: '/api/v1/trips', cookie: carol });
    expect(res.statusCode).toBe(200);
    const names = res.json().data.map((trip: { name: string }) => trip.name);
    expect(names).toEqual(['Sooner', 'Later']);
    expect(res.json().data[0]).not.toHaveProperty('activities');
  });
});

describe('GET /api/v1/trips/:tripId', () => {
  it('returns the Trip with Activities sorted by date and position', async () => {
    const trip = await createTrip(alice);
    await addActivity(trip.id, '2027-03-14', 'Later day', 0);
    await addActivity(trip.id, '2027-03-13', 'Second', 1);
    await addActivity(trip.id, '2027-03-13', 'First', 0);

    const res = await t.request({ method: 'GET', url: `/api/v1/trips/${trip.id}`, cookie: alice });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.activities.map((a: { text: string }) => a.text)).toEqual([
      'First',
      'Second',
      'Later day',
    ]);
  });

  it("returns 404 for another User's Trip, an unknown id and a malformed id (BR-8)", async () => {
    const trip = await createTrip(alice);
    for (const [id, token] of [
      [trip.id, bob],
      ['3f0c8a4e-6b1d-4c1e-9a57-2f8a7c1d9b10', alice],
      ['not-a-uuid', alice],
    ] as const) {
      const res = await t.request({ method: 'GET', url: `/api/v1/trips/${id}`, cookie: token });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('NOT_FOUND');
    }
  });
});

describe('PUT /api/v1/trips/:tripId', () => {
  it('replaces name, Trip Type and Destinations, keeping Activities on remaining dates', async () => {
    const trip = await createTrip(alice);
    await addActivity(trip.id, '2027-03-13', 'Fushimi Inari');

    const res = await t.request({
      method: 'PUT',
      url: `/api/v1/trips/${trip.id}`,
      cookie: alice,
      payload: {
        name: 'Japan & Tokyo',
        tripType: 'friends',
        destinations: [
          ...japan.destinations,
          { name: 'Tokyo', startDate: '2027-03-17', endDate: '2027-03-19' },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    const updated = res.json().data;
    expect(updated).toMatchObject({
      name: 'Japan & Tokyo',
      tripType: 'friends',
      endDate: '2027-03-19',
      dayCount: 8,
    });
    expect(updated.destinations).toHaveLength(3);
    expect(updated.activities.map((a: { text: string }) => a.text)).toEqual(['Fushimi Inari']);
  });

  it('refuses to remove dates with Activities unless confirmed (BR-12)', async () => {
    const trip = await createTrip(alice);
    await addActivity(trip.id, '2027-03-16', 'Dotonbori', 0);
    await addActivity(trip.id, '2027-03-16', 'Osaka Castle', 1);
    await addActivity(trip.id, '2027-03-12', 'Arrive', 0);
    const shorter = {
      ...japan,
      destinations: [
        japan.destinations[0],
        { name: 'Osaka', startDate: '2027-03-14', endDate: '2027-03-15' },
      ],
    };

    const refused = await t.request({
      method: 'PUT',
      url: `/api/v1/trips/${trip.id}`,
      cookie: alice,
      payload: shorter,
    });
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error).toEqual({
      code: 'ACTIVITIES_WOULD_BE_DELETED',
      message: 'This change removes 1 day that has activities',
      details: [{ date: '2027-03-16', count: 2 }],
    });
    // Nothing changed.
    const unchanged = await t.request({
      method: 'GET',
      url: `/api/v1/trips/${trip.id}`,
      cookie: alice,
    });
    expect(unchanged.json().data.endDate).toBe('2027-03-16');
    expect(unchanged.json().data.activities).toHaveLength(3);

    const confirmed = await t.request({
      method: 'PUT',
      url: `/api/v1/trips/${trip.id}`,
      cookie: alice,
      payload: { ...shorter, confirmDeleteActivities: true },
    });
    expect(confirmed.statusCode).toBe(200);
    expect(confirmed.json().data.endDate).toBe('2027-03-15');
    expect(confirmed.json().data.activities.map((a: { text: string }) => a.text)).toEqual([
      'Arrive',
    ]);
  });

  it('accepts confirmDeleteActivities when nothing would be deleted', async () => {
    const trip = await createTrip(alice);
    const res = await t.request({
      method: 'PUT',
      url: `/api/v1/trips/${trip.id}`,
      cookie: alice,
      payload: { ...japan, confirmDeleteActivities: true },
    });
    expect(res.statusCode).toBe(200);
  });

  it("returns 404 for another User's Trip", async () => {
    const trip = await createTrip(alice);
    const res = await t.request({
      method: 'PUT',
      url: `/api/v1/trips/${trip.id}`,
      cookie: bob,
      payload: japan,
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('DELETE /api/v1/trips/:tripId', () => {
  it('deletes the Trip with its Destinations and Activities', async () => {
    const trip = await createTrip(alice);
    await addActivity(trip.id, '2027-03-13', 'Gone soon');

    const notMine = await t.request({
      method: 'DELETE',
      url: `/api/v1/trips/${trip.id}`,
      cookie: bob,
    });
    expect(notMine.statusCode).toBe(404);

    const res = await t.request({
      method: 'DELETE',
      url: `/api/v1/trips/${trip.id}`,
      cookie: alice,
    });
    expect(res.statusCode).toBe(204);
    expect(await t.db.select().from(destinations).where(eq(destinations.tripId, trip.id))).toEqual(
      [],
    );
    expect(await t.db.select().from(activities).where(eq(activities.tripId, trip.id))).toEqual([]);

    const again = await t.request({
      method: 'DELETE',
      url: `/api/v1/trips/${trip.id}`,
      cookie: alice,
    });
    expect(again.statusCode).toBe(404);
  });
});
