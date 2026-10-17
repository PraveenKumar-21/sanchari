export const TRIP_TYPES = ['solo', 'couple', 'family', 'friends'] as const;
export type TripType = (typeof TRIP_TYPES)[number];

export const TRIP_TYPE_LABELS: Record<TripType, string> = {
  solo: 'Solo',
  couple: 'Couple',
  family: 'Family',
  friends: 'Group of Friends',
};

// Limits from goal-spec §8 and backend-spec §6.
export const MAX_TRIP_DAYS = 60;
export const MAX_DESTINATIONS = 10;
export const MAX_NAME_LENGTH = 100;
export const MAX_ACTIVITY_LENGTH = 500;
export const MAX_ACTIVITIES_PER_DATE = 50;
export const MAX_TRIPS_PER_USER = 200;

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 30;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

/** Stable error codes (api-contract §4). */
export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'INVALID_CREDENTIALS',
  'FORBIDDEN',
  'NOT_FOUND',
  'USERNAME_TAKEN',
  'ACTIVITIES_WOULD_BE_DELETED',
  'LIMIT_REACHED',
  'CONFLICT',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];
