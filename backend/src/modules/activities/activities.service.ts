import { type Activity, type ActivityCreateInput, MAX_ACTIVITIES_PER_DATE } from '@sanchari/shared';
import { and, asc, eq, gt, gte, sql } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { activities } from '../../db/schema';
import { AppError, notFound } from '../../lib/app-error';
import { assertUuid, findOwnedTrip, toActivity } from '../trips/trips.service';

type TripRow = Awaited<ReturnType<typeof findOwnedTrip>>;

/** Runs `fn` in a transaction holding a lock on the owned Trip, so positions stay contiguous. */
function withLockedTrip<T>(
  db: Db,
  userId: string,
  tripId: string,
  fn: (tx: Db, trip: TripRow) => Promise<T>,
): Promise<T> {
  return db.transaction(async (rawTx) => {
    const tx = rawTx as unknown as Db;
    const trip = await findOwnedTrip(tx, userId, tripId, true);
    return fn(tx, trip);
  });
}

/** BR-10: the date must be within the Trip Dates. */
function assertWithinTrip(trip: TripRow, date: string, path: string) {
  if (date < trip.startDate || date > trip.endDate) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Some fields are invalid', [
      { path, message: `Date must be within the trip (${trip.startDate} to ${trip.endDate})` },
    ]);
  }
}

const onDate = (tripId: string, date: string) =>
  and(eq(activities.tripId, tripId), eq(activities.date, date));

async function findActivity(tx: Db, tripId: string, activityId: string) {
  assertUuid(activityId);
  const [row] = await tx
    .select()
    .from(activities)
    .where(and(eq(activities.id, activityId), eq(activities.tripId, tripId)));
  if (!row) throw notFound('Activity not found');
  return row;
}

export function createActivity(
  db: Db,
  userId: string,
  tripId: string,
  input: ActivityCreateInput & { text: string },
): Promise<Activity> {
  return withLockedTrip(db, userId, tripId, async (tx, trip) => {
    assertWithinTrip(trip, input.date, 'date');
    const siblings = await tx
      .select({ id: activities.id })
      .from(activities)
      .where(onDate(tripId, input.date));
    if (siblings.length >= MAX_ACTIVITIES_PER_DATE) {
      throw new AppError(
        409,
        'LIMIT_REACHED',
        `A day can have at most ${MAX_ACTIVITIES_PER_DATE} activities`,
        [{ limit: 'activitiesPerDate', max: MAX_ACTIVITIES_PER_DATE }],
      );
    }

    // Insert at `position` (clamped to the end), shifting later Activities down by one.
    const position = Math.min(input.position ?? siblings.length, siblings.length);
    await tx
      .update(activities)
      .set({ position: sql`${activities.position} + 1` })
      .where(and(onDate(tripId, input.date), gte(activities.position, position)));
    const [row] = await tx
      .insert(activities)
      .values({ tripId, date: input.date, position, text: input.text })
      .returning();
    return toActivity(row!);
  });
}

export function updateActivity(
  db: Db,
  userId: string,
  tripId: string,
  activityId: string,
  text: string,
): Promise<Activity> {
  return withLockedTrip(db, userId, tripId, async (tx) => {
    await findActivity(tx, tripId, activityId);
    const [row] = await tx
      .update(activities)
      .set({ text, updatedAt: sql`now()` })
      .where(eq(activities.id, activityId))
      .returning();
    return toActivity(row!);
  });
}

export function deleteActivity(
  db: Db,
  userId: string,
  tripId: string,
  activityId: string,
): Promise<void> {
  return withLockedTrip(db, userId, tripId, async (tx) => {
    const row = await findActivity(tx, tripId, activityId);
    await tx.delete(activities).where(eq(activities.id, activityId));
    // Close the gap so positions stay 0…n−1.
    await tx
      .update(activities)
      .set({ position: sql`${activities.position} - 1` })
      .where(and(onDate(tripId, row.date), gt(activities.position, row.position)));
  });
}

/** BR-13: `orderedIds` must be exactly the Activities currently on `date`, each once. */
export function reorderActivities(
  db: Db,
  userId: string,
  tripId: string,
  date: string,
  orderedIds: string[],
): Promise<Activity[]> {
  return withLockedTrip(db, userId, tripId, async (tx, trip) => {
    assertWithinTrip(trip, date, 'params.date');
    const current = await tx
      .select({ id: activities.id })
      .from(activities)
      .where(onDate(tripId, date));
    const currentIds = new Set(current.map((r) => r.id));
    const matches =
      orderedIds.length === currentIds.size && orderedIds.every((id) => currentIds.has(id));
    if (!matches) {
      throw new AppError(
        409,
        'CONFLICT',
        'The activities for this day have changed. Reload and try again.',
      );
    }

    for (const [position, id] of orderedIds.entries()) {
      await tx.update(activities).set({ position }).where(eq(activities.id, id));
    }
    const rows = await tx
      .select()
      .from(activities)
      .where(onDate(tripId, date))
      .orderBy(asc(activities.position));
    return rows.map(toActivity);
  });
}
