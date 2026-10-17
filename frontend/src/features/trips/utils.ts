import type { TripInputParsed, TripSummary } from '@sanchari/shared';

/** "Kyoto → Osaka → Tokyo", truncated after 3 with "+N more" (frontend-spec §4.3). */
export function destinationChain(trip: Pick<TripSummary, 'destinations'>) {
  const names = trip.destinations.map((d) => d.name);
  const shown = names.slice(0, 3).join(' → ');
  return names.length > 3 ? `${shown} +${names.length - 3} more` : shown;
}

export type TripFormValues = {
  name: string;
  tripType: TripInputParsed['tripType'] | '';
  destinations: { name: string; startDate: string; endDate: string }[];
};

export const emptyTripForm: TripFormValues = {
  name: '',
  tripType: '',
  destinations: [{ name: '', startDate: '', endDate: '' }],
};
