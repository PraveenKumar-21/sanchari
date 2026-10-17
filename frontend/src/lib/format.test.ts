import { describe, expect, it } from 'vitest';
import { formatDay, formatLongDate, formatRange, pluralize } from './format';

describe('format', () => {
  it('formats days without time-zone shifts', () => {
    expect(formatDay('2027-03-14')).toBe('Sun 14 Mar');
    expect(formatLongDate('2027-03-14')).toBe('Sunday, 14 March 2027');
  });

  it('formats ranges within a month, across months and across years', () => {
    expect(formatRange('2027-03-12', '2027-03-16')).toBe('12 – 16 Mar 2027');
    expect(formatRange('2027-03-28', '2027-04-02')).toBe('28 Mar – 2 Apr 2027');
    expect(formatRange('2027-12-28', '2028-01-02')).toBe('28 Dec 2027 – 2 Jan 2028');
    expect(formatRange('2027-03-14', '2027-03-14')).toBe('14 Mar 2027');
  });

  it('pluralizes', () => {
    expect(pluralize(1, 'day')).toBe('1 day');
    expect(pluralize(2, 'activity', 'activities')).toBe('2 activities');
  });
});
