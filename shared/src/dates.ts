// Calendar-date helpers (frontend-spec §6.4). Dates are 'YYYY-MM-DD' strings with no time zone.
// Arithmetic goes through day counts since the epoch, so local time zones can never shift a date.

/** A calendar date, 'YYYY-MM-DD'. */
export type IsoDate = string;

export type DateRange = { startDate: IsoDate; endDate: IsoDate };

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

function toEpochDay(date: IsoDate): number {
  const m = DATE_RE.exec(date);
  if (!m) throw new RangeError(`Invalid date: ${date}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / MS_PER_DAY;
}

function fromEpochDay(day: number): IsoDate {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

/** True for a real calendar date in 'YYYY-MM-DD' form (rejects 2027-02-30). */
export function isValidDate(value: string): boolean {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const year = Number(m[1]);
  if (year < 1900 || year > 9999) return false;
  return fromEpochDay(toEpochDay(value)) === value;
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return fromEpochDay(toEpochDay(date) + days);
}

/** Whole days from `from` to `to` (negative if `to` is earlier). */
export function diffDays(from: IsoDate, to: IsoDate): number {
  return toEpochDay(to) - toEpochDay(from);
}

/** Every date from `startDate` to `endDate`, inclusive. */
export function listDates(startDate: IsoDate, endDate: IsoDate): IsoDate[] {
  const count = diffDays(startDate, endDate) + 1;
  return Array.from({ length: Math.max(count, 0) }, (_, i) => addDays(startDate, i));
}

/** Number of Days in an inclusive range: endDate − startDate + 1. */
export function dayCount(startDate: IsoDate, endDate: IsoDate): number {
  return diffDays(startDate, endDate) + 1;
}

/** Day Number of `date` in a Trip starting on `tripStart` (Day 1 = tripStart). */
export function dayNumber(tripStart: IsoDate, date: IsoDate): number {
  return diffDays(tripStart, date) + 1;
}

/** Trip Dates: earliest start to latest end (BR-7). Null for an empty list. */
export function tripDates(destinations: readonly DateRange[]): DateRange | null {
  if (destinations.length === 0) return null;
  let startDate = destinations[0]!.startDate;
  let endDate = destinations[0]!.endDate;
  for (const d of destinations) {
    if (d.startDate < startDate) startDate = d.startDate;
    if (d.endDate > endDate) endDate = d.endDate;
  }
  return { startDate, endDate };
}

/** The Destination(s) covering `date`: two on a Travel Day, normally one. */
export function destinationsForDate<T extends DateRange>(
  destinations: readonly T[],
  date: IsoDate,
): T[] {
  return destinations.filter((d) => d.startDate <= date && date <= d.endDate);
}

export type TripDay<T extends DateRange> = { date: IsoDate; dayNumber: number; destinations: T[] };

/** The Itinerary's Days: one per date in the Trip Dates, labelled with their Destination(s). */
export function listTripDates<T extends DateRange>(destinations: readonly T[]): TripDay<T>[] {
  const range = tripDates(destinations);
  if (!range) return [];
  return listDates(range.startDate, range.endDate).map((date, i) => ({
    date,
    dayNumber: i + 1,
    destinations: destinationsForDate(destinations, date),
  }));
}

/** Sorted by start date, then end date (the order Destinations are stored and shown in). */
export function sortDestinations<T extends DateRange>(destinations: readonly T[]): T[] {
  return [...destinations].sort(
    (a, b) => a.startDate.localeCompare(b.startDate) || a.endDate.localeCompare(b.endDate),
  );
}

/** Today in the viewer's local time zone, as 'YYYY-MM-DD'. */
export function todayLocal(now: Date = new Date()): IsoDate {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
