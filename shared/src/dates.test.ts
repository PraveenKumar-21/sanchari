import { describe, expect, it } from 'vitest';
import {
  addDays,
  dayCount,
  dayNumber,
  destinationsForDate,
  diffDays,
  isValidDate,
  listDates,
  listTripDates,
  sortDestinations,
  todayLocal,
  tripDates,
} from './dates';

const kyoto = { name: 'Kyoto', startDate: '2027-03-12', endDate: '2027-03-14' };
const osaka = { name: 'Osaka', startDate: '2027-03-14', endDate: '2027-03-16' };

describe('isValidDate', () => {
  it.each(['2027-03-14', '2028-02-29', '2027-12-31', '2027-01-01'])('accepts %s', (d) => {
    expect(isValidDate(d)).toBe(true);
  });

  it.each([
    '2027-02-29',
    '2027-02-30',
    '2027-13-01',
    '2027-00-10',
    '2027-3-14',
    '14-03-2027',
    '',
    'abc',
  ])('rejects %s', (d) => {
    expect(isValidDate(d)).toBe(false);
  });
});

describe('date arithmetic', () => {
  it('adds days across month, year and leap-day boundaries', () => {
    expect(addDays('2027-03-31', 1)).toBe('2027-04-01');
    expect(addDays('2027-12-31', 1)).toBe('2028-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2027-03-01', -1)).toBe('2027-02-28');
  });

  it('diffs and counts days', () => {
    expect(diffDays('2027-03-12', '2027-03-16')).toBe(4);
    expect(diffDays('2027-03-16', '2027-03-12')).toBe(-4);
    expect(dayCount('2027-03-12', '2027-03-12')).toBe(1);
    expect(dayCount('2027-03-12', '2027-03-16')).toBe(5);
  });

  it('lists dates inclusively', () => {
    expect(listDates('2028-02-28', '2028-03-01')).toEqual([
      '2028-02-28',
      '2028-02-29',
      '2028-03-01',
    ]);
    expect(listDates('2027-03-14', '2027-03-14')).toEqual(['2027-03-14']);
  });

  it('numbers Days from 1', () => {
    expect(dayNumber('2027-03-12', '2027-03-12')).toBe(1);
    expect(dayNumber('2027-03-12', '2027-03-16')).toBe(5);
  });
});

describe('trip dates', () => {
  it('spans the earliest start to the latest end', () => {
    expect(tripDates([osaka, kyoto])).toEqual({ startDate: '2027-03-12', endDate: '2027-03-16' });
    expect(tripDates([])).toBeNull();
  });

  it('finds both Destinations on a Travel Day', () => {
    expect(destinationsForDate([kyoto, osaka], '2027-03-14').map((d) => d.name)).toEqual([
      'Kyoto',
      'Osaka',
    ]);
    expect(destinationsForDate([kyoto, osaka], '2027-03-13').map((d) => d.name)).toEqual(['Kyoto']);
  });

  it('lists the Itinerary Days with Day Numbers and Destinations', () => {
    const days = listTripDates([kyoto, osaka]);
    expect(days).toHaveLength(5);
    expect(days[0]).toMatchObject({ date: '2027-03-12', dayNumber: 1 });
    expect(days[2]!.destinations.map((d) => d.name)).toEqual(['Kyoto', 'Osaka']);
    expect(days[4]).toMatchObject({ date: '2027-03-16', dayNumber: 5 });
  });

  it('sorts Destinations by start date, then end date', () => {
    const oneDay = { name: 'Nara', startDate: '2027-03-14', endDate: '2027-03-14' };
    expect(sortDestinations([osaka, oneDay, kyoto]).map((d) => d.name)).toEqual([
      'Kyoto',
      'Nara',
      'Osaka',
    ]);
  });
});

describe('todayLocal', () => {
  it('formats the local calendar date', () => {
    expect(todayLocal(new Date(2027, 2, 5, 23, 59))).toBe('2027-03-05');
  });
});
