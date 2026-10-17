export const TRIP_TYPES = ['solo', 'couple', 'family', 'friends'] as const;
export type TripType = (typeof TRIP_TYPES)[number];

export const TRIP_TYPE_LABELS: Record<TripType, string> = {
  solo: 'Solo',
  couple: 'Couple',
  family: 'Family',
  friends: 'Group of Friends',
};
