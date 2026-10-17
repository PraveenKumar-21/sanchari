import { MAX_TRIP_DAYS } from './constants';
import { addDays, type DateRange, dayCount } from './dates';

/** A validation problem, with a path relative to the destinations array (api-contract §4). */
export type SequenceIssue = { path: (string | number)[]; message: string };

/**
 * Checks a Destination list that is already sorted by start date (BR-5 dates, BR-6, BR-7):
 * - each end date is on or after its start date;
 * - each Destination starts on the previous one's end date (a Travel Day) or the day after;
 * - the whole Trip is at most MAX_TRIP_DAYS long.
 */
export function validateDestinationSequence(sorted: readonly DateRange[]): SequenceIssue[] {
  const issues: SequenceIssue[] = [];

  sorted.forEach((d, i) => {
    if (d.endDate < d.startDate) {
      issues.push({ path: [i, 'endDate'], message: 'End date must be on or after the start date' });
    }
    const prev = sorted[i - 1];
    if (prev && prev.endDate >= prev.startDate) {
      const earliest = prev.endDate;
      const latest = addDays(prev.endDate, 1);
      if (d.startDate < earliest || d.startDate > latest) {
        issues.push({ path: [i, 'startDate'], message: `Must start on ${earliest} or ${latest}` });
      }
    }
  });

  const first = sorted[0];
  if (first && issues.length === 0) {
    const lastEnd = sorted.reduce((max, d) => (d.endDate > max ? d.endDate : max), first.endDate);
    if (dayCount(first.startDate, lastEnd) > MAX_TRIP_DAYS) {
      issues.push({ path: [], message: `A trip can be at most ${MAX_TRIP_DAYS} days long` });
    }
  }

  return issues;
}
