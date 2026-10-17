import { TRIP_TYPES } from '@sanchari/shared';
import { sql } from 'drizzle-orm';
import {
  char,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

// Schema per backend-spec §5. Calendar dates are exchanged as 'YYYY-MM-DD' strings.

const createdAt = () =>
  timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow();

export const tripType = pgEnum('trip_type', TRIP_TYPES);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: varchar('username', { length: 30 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: createdAt(),
});

export const sessions = pgTable(
  'sessions',
  {
    // SHA-256 hex of the session token; the raw token is never stored.
    id: char('id', { length: 64 }).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  },
  (t) => [
    index('sessions_user_id_idx').on(t.userId),
    index('sessions_expires_at_idx').on(t.expiresAt),
  ],
);

export const trips = pgTable(
  'trips',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    tripType: tripType('trip_type').notNull(),
    // Derived from destinations (BR-7); kept in sync by the trips service.
    startDate: date('start_date', { mode: 'string' }).notNull(),
    endDate: date('end_date', { mode: 'string' }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('trips_user_id_start_date_idx').on(t.userId, t.startDate),
    check('trips_dates_check', sql`${t.endDate} >= ${t.startDate}`),
  ],
);

export const destinations = pgTable(
  'destinations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    position: smallint('position').notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    startDate: date('start_date', { mode: 'string' }).notNull(),
    endDate: date('end_date', { mode: 'string' }).notNull(),
  },
  (t) => [
    unique('destinations_trip_id_position_key').on(t.tripId, t.position),
    check('destinations_dates_check', sql`${t.endDate} >= ${t.startDate}`),
  ],
);

export const activities = pgTable(
  'activities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    date: date('date', { mode: 'string' }).notNull(),
    // 0-based, kept contiguous per (trip_id, date).
    position: integer('position').notNull(),
    text: varchar('text', { length: 500 }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('activities_trip_id_date_position_idx').on(t.tripId, t.date, t.position)],
);

export const rateLimits = pgTable('rate_limits', {
  key: text('key').primaryKey(),
  windowStart: timestamp('window_start', { withTimezone: true, mode: 'date' }).notNull(),
  count: integer('count').notNull(),
});
