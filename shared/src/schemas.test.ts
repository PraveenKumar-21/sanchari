import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { validateDestinationSequence } from './destinations';
import {
  activityCreateInputSchema,
  activityOrderInputSchema,
  activityTextSchema,
  loginInputSchema,
  signupInputSchema,
  tripInputSchema,
  tripUpdateInputSchema,
} from './index';

const dest = (name: string, startDate: string, endDate: string) => ({ name, startDate, endDate });
const trip = (destinations: unknown[]) => ({
  name: 'Japan Spring',
  tripType: 'couple',
  destinations,
});

/** Issues as the API reports them: dot-joined paths (api-contract §4). */
function issues(result: z.ZodSafeParseResult<unknown>) {
  if (result.success) return [];
  return result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
}

describe('validateDestinationSequence (BR-6, BR-7)', () => {
  it('accepts a Travel Day and back-to-back Destinations', () => {
    expect(
      validateDestinationSequence([
        dest('Kyoto', '2027-03-12', '2027-03-14'),
        dest('Osaka', '2027-03-14', '2027-03-16'),
        dest('Tokyo', '2027-03-17', '2027-03-20'),
      ]),
    ).toEqual([]);
  });

  it('rejects a gap', () => {
    expect(
      validateDestinationSequence([
        dest('Kyoto', '2027-03-12', '2027-03-14'),
        dest('Osaka', '2027-03-16', '2027-03-18'),
      ]),
    ).toEqual([{ path: [1, 'startDate'], message: 'Must start on 2027-03-14 or 2027-03-15' }]);
  });

  it('rejects an overlap beyond the Travel Day', () => {
    expect(
      validateDestinationSequence([
        dest('Kyoto', '2027-03-12', '2027-03-15'),
        dest('Osaka', '2027-03-14', '2027-03-18'),
      ]),
    ).toEqual([{ path: [1, 'startDate'], message: 'Must start on 2027-03-15 or 2027-03-16' }]);
  });

  it('rejects an end date before the start date', () => {
    expect(validateDestinationSequence([dest('Kyoto', '2027-03-14', '2027-03-12')])).toEqual([
      { path: [0, 'endDate'], message: 'End date must be on or after the start date' },
    ]);
  });

  it('allows exactly 60 days and rejects 61', () => {
    expect(validateDestinationSequence([dest('Long', '2027-01-01', '2027-03-01')])).toEqual([]);
    expect(validateDestinationSequence([dest('Long', '2027-01-01', '2027-03-02')])).toEqual([
      { path: [], message: 'A trip can be at most 60 days long' },
    ]);
  });
});

describe('tripInputSchema (BR-3 to BR-7)', () => {
  it('accepts a 1-day trip', () => {
    expect(
      tripInputSchema.safeParse(trip([dest('Nara', '2027-03-14', '2027-03-14')])).success,
    ).toBe(true);
  });

  it('sorts Destinations and trims names', () => {
    const result = tripInputSchema.parse({
      ...trip([
        dest(' Osaka ', '2027-03-14', '2027-03-16'),
        dest('Kyoto', '2027-03-12', '2027-03-14'),
      ]),
      name: '  Japan Spring  ',
    });
    expect(result.name).toBe('Japan Spring');
    expect(result.destinations.map((d) => d.name)).toEqual(['Kyoto', 'Osaka']);
  });

  it('reports sequence issues at the sorted index', () => {
    const result = tripInputSchema.safeParse(
      trip([dest('Osaka', '2027-03-16', '2027-03-18'), dest('Kyoto', '2027-03-12', '2027-03-14')]),
    );
    expect(issues(result)).toEqual([
      { path: 'destinations.1.startDate', message: 'Must start on 2027-03-14 or 2027-03-15' },
    ]);
  });

  it('requires 1 to 10 Destinations', () => {
    expect(issues(tripInputSchema.safeParse(trip([])))).toEqual([
      { path: 'destinations', message: 'Add at least one destination' },
    ]);
    const eleven = Array.from({ length: 11 }, (_, i) =>
      dest(
        `D${i}`,
        `2027-03-${String(i + 1).padStart(2, '0')}`,
        `2027-03-${String(i + 1).padStart(2, '0')}`,
      ),
    );
    expect(issues(tripInputSchema.safeParse(trip(eleven)))[0]?.path).toBe('destinations');
  });

  it('rejects invalid dates, blank names, unknown trip types and unknown fields', () => {
    expect(
      issues(tripInputSchema.safeParse(trip([dest('Kyoto', '2027-02-30', '2027-03-01')])))[0],
    ).toEqual({
      path: 'destinations.0.startDate',
      message: 'Must be a valid date (YYYY-MM-DD)',
    });
    expect(
      issues(
        tripInputSchema.safeParse({
          ...trip([dest('K', '2027-03-01', '2027-03-01')]),
          name: '   ',
        }),
      )[0]?.path,
    ).toBe('name');
    expect(
      tripInputSchema.safeParse({
        ...trip([dest('K', '2027-03-01', '2027-03-01')]),
        tripType: 'business',
      }).success,
    ).toBe(false);
    expect(
      tripInputSchema.safeParse({ ...trip([dest('K', '2027-03-01', '2027-03-01')]), extra: 1 })
        .success,
    ).toBe(false);
  });

  it('update input accepts confirmDeleteActivities', () => {
    const parsed = tripUpdateInputSchema.parse({
      ...trip([dest('K', '2027-03-01', '2027-03-01')]),
      confirmDeleteActivities: true,
    });
    expect(parsed.confirmDeleteActivities).toBe(true);
  });
});

describe('auth schemas (BR-1, BR-2)', () => {
  it('lowercases and trims usernames', () => {
    expect(
      signupInputSchema.parse({ username: ' Praveen_K ', password: 'correct-horse' }).username,
    ).toBe('praveen_k');
  });

  it.each(['ab', 'a'.repeat(31), 'has space', 'émile', 'semi;colon'])(
    'rejects username %j',
    (username) => {
      expect(signupInputSchema.safeParse({ username, password: 'correct-horse' }).success).toBe(
        false,
      );
    },
  );

  it('enforces password length 8 to 128 without trimming', () => {
    expect(signupInputSchema.safeParse({ username: 'abc', password: '1234567' }).success).toBe(
      false,
    );
    expect(signupInputSchema.safeParse({ username: 'abc', password: '        ' }).success).toBe(
      true,
    );
    expect(
      signupInputSchema.safeParse({ username: 'abc', password: 'x'.repeat(129) }).success,
    ).toBe(false);
  });

  it('login only checks presence', () => {
    expect(loginInputSchema.safeParse({ username: 'AB', password: 'x' }).success).toBe(true);
    expect(loginInputSchema.parse({ username: 'AB', password: 'x' }).username).toBe('ab');
    expect(loginInputSchema.safeParse({ username: '', password: '' }).success).toBe(false);
  });
});

describe('activity schemas (BR-9, BR-13)', () => {
  it('trims and limits text to one line of 500 characters', () => {
    expect(activityTextSchema.parse('  Fushimi Inari  ')).toBe('Fushimi Inari');
    expect(activityTextSchema.safeParse('a'.repeat(500)).success).toBe(true);
    expect(activityTextSchema.safeParse('a'.repeat(501)).success).toBe(false);
    expect(activityTextSchema.safeParse('line one\nline two').success).toBe(false);
    expect(activityTextSchema.safeParse('   ').success).toBe(false);
  });

  it('accepts an optional non-negative position', () => {
    expect(
      activityCreateInputSchema.safeParse({ date: '2027-03-13', text: 'x', position: 0 }).success,
    ).toBe(true);
    expect(
      activityCreateInputSchema.safeParse({ date: '2027-03-13', text: 'x', position: -1 }).success,
    ).toBe(false);
  });

  it('rejects duplicate ids in a reorder', () => {
    const id = 'a1b2c3d4-0000-4000-8000-000000000001';
    expect(activityOrderInputSchema.safeParse({ activityIds: [id, id] }).success).toBe(false);
    expect(activityOrderInputSchema.safeParse({ activityIds: [id] }).success).toBe(true);
  });
});
