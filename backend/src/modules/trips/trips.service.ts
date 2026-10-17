import {
  type Activity,
  type ActivitiesWouldBeDeletedDetail,
  dayCount,
  MAX_TRIPS_PER_USER,
  type TripDetail,
  type TripInputParsed,
  type TripSummary,
  type TripUpdateInputParsed,
  tripDates,
} from '@sanchari/shared';
import { and, asc, count, eq, gt, inArray, lt, or, sql } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { activities, destinations, trips } from '../../db/schema';
import { AppError, notFound } from '../../lib/app-error';

type TripRow = typeof trips.$inferSelect;
type DestinationRow = typeof destinations.$inferSelect;
type ActivityRow = typeof activities.$inferSelect;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A malformed id is reported like an unknown one (api-contract §3). */
export function assertUuid(id: string): void {
  if (!UUID_RE.test(id)) throw notFound();
}

function toSummary(trip: TripRow, dests: DestinationRow[]): TripSummary {
  return {
    id: trip.id,
    name: trip.name,
    tripType: trip.tripType,
    startDate: trip.startDate,
    endDate: trip.endDate,
    dayCount: dayCount(trip.startDate, trip.endDate),
    destinations: dests
      .sort((a, b) => a.position - b.position)
      .map((d) => ({ name: d.name, startDate: d.startDate, endDate: d.endDate })),
    createdAt: trip.createdAt.toISOString(),
    updatedAt: trip.updatedAt.toISOString(),
  };
}

export function toActivity(row: ActivityRow): Activity {
  return {
    id: row.id,
    date: row.date,
    position: row.position,
    text: row.text,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** The Trip row, scoped to its owner (BR-8); 404 otherwise. `lock` takes a row lock for writes. */
export async function findOwnedTrip(db: Db, userId: string, tripId: string, lock = false) {
  assertUuid(tripId);
  const query = db
    .select()
    .from(trips)
    .where(and(eq(trips.id, tripId), eq(trips.userId, userId)));
  const [trip] = await (lock ? query.for('update') : query);
  if (!trip) throw notFound('Trip not found');
  return trip;
}

export async function listTrips(db: Db, userId: string): Promise<TripSummary[]> {
  const rows = await db
    .select()
    .from(trips)
    .where(eq(trips.userId, userId))
    .orderBy(asc(trips.startDate), asc(trips.createdAt));
  if (rows.length === 0) return [];

  const dests = await db
    .select()
    .from(destinations)
    .where(
      inArray(
        destinations.tripId,
        rows.map((r) => r.id),
      ),
    );
  const byTrip = Map.groupBy(dests, (d) => d.tripId);
  return rows.map((trip) => toSummary(trip, byTrip.get(trip.id) ?? []));
}

export async function getTrip(db: Db, userId: string, tripId: string): Promise<TripDetail> {
  const trip = await findOwnedTrip(db, userId, tripId);
  return loadDetail(db, trip);
}

async function loadDetail(db: Db, trip: TripRow): Promise<TripDetail> {
  const [dests, acts] = await Promise.all([
    db.select().from(destinations).where(eq(destinations.tripId, trip.id)),
    db
      .select()
      .from(activities)
      .where(eq(activities.tripId, trip.id))
      .orderBy(asc(activities.date), asc(activities.position), asc(activities.createdAt)),
  ]);
  return { ...toSummary(trip, dests), activities: acts.map(toActivity) };
}

async function insertDestinations(db: Db, tripId: string, list: TripInputParsed['destinations']) {
  await db.insert(destinations).values(list.map((d, position) => ({ tripId, position, ...d })));
}

export async function createTrip(
  db: Db,
  userId: string,
  input: TripInputParsed,
): Promise<TripDetail> {
  return db.transaction(async (tx) => {
    const [{ value: existing } = { value: 0 }] = await tx
      .select({ value: count() })
      .from(trips)
      .where(eq(trips.userId, userId));
    if (existing >= MAX_TRIPS_PER_USER) {
      throw new AppError(409, 'LIMIT_REACHED', `You can have at most ${MAX_TRIPS_PER_USER} trips`, [
        { limit: 'tripsPerUser', max: MAX_TRIPS_PER_USER },
      ]);
    }

    const range = tripDates(input.destinations)!;
    const [trip] = (await tx
      .insert(trips)
      .values({ userId, name: input.name, tripType: input.tripType, ...range })
      .returning()) as [TripRow];
    await insertDestinations(tx as unknown as Db, trip.id, input.destinations);
    return loadDetail(tx as unknown as Db, trip);
  });
}

/** backend-spec §8 `updateTrip`: one transaction, BR-6/BR-7 (already validated) and BR-12. */
export async function updateTrip(
  db: Db,
  userId: string,
  tripId: string,
  input: TripUpdateInputParsed,
): Promise<TripDetail> {
  return db.transaction(async (rawTx) => {
    const tx = rawTx as unknown as Db;
    await findOwnedTrip(tx, userId, tripId, true);
    const range = tripDates(input.destinations)!;

    const outside = or(lt(activities.date, range.startDate), gt(activities.date, range.endDate));
    const removed = await tx
      .select({ date: activities.date, count: count() })
      .from(activities)
      .where(and(eq(activities.tripId, tripId), outside))
      .groupBy(activities.date)
      .orderBy(asc(activities.date));

    if (removed.length > 0) {
      if (!input.confirmDeleteActivities) {
        const days = removed.length === 1 ? '1 day' : `${removed.length} days`;
        const details: ActivitiesWouldBeDeletedDetail[] = removed.map((r) => ({
          date: r.date,
          count: Number(r.count),
        }));
        throw new AppError(
          409,
          'ACTIVITIES_WOULD_BE_DELETED',
          `This change removes ${days} that ${removed.length === 1 ? 'has' : 'have'} activities`,
          details,
        );
      }
      await tx.delete(activities).where(and(eq(activities.tripId, tripId), outside));
    }

    await tx.delete(destinations).where(eq(destinations.tripId, tripId));
    await insertDestinations(tx, tripId, input.destinations);

    const [trip] = (await tx
      .update(trips)
      .set({ name: input.name, tripType: input.tripType, ...range, updatedAt: sql`now()` })
      .where(eq(trips.id, tripId))
      .returning()) as [TripRow];
    return loadDetail(tx, trip);
  });
}

export async function deleteTrip(db: Db, userId: string, tripId: string): Promise<void> {
  assertUuid(tripId);
  const deleted = await db
    .delete(trips)
    .where(and(eq(trips.id, tripId), eq(trips.userId, userId)))
    .returning({ id: trips.id });
  if (deleted.length === 0) throw notFound('Trip not found');
}
