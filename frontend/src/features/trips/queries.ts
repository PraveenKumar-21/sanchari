import type { TripDetail, TripInput, TripSummary, TripUpdateInput } from '@sanchari/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '@/lib/api/client';

// Query keys per frontend-spec §6.2.
export const tripsKey = ['trips'] as const;
export const tripKey = (tripId: string) => ['trip', tripId] as const;

/** Don't retry client errors such as 404. */
const retryServerErrors = (count: number, err: unknown) =>
  count < 1 && !(err instanceof ApiError && err.status >= 400 && err.status < 500);

export function useTrips() {
  return useQuery({
    queryKey: tripsKey,
    queryFn: () => api<TripSummary[]>('/trips'),
    retry: retryServerErrors,
  });
}

export function useTrip(tripId: string) {
  return useQuery({
    queryKey: tripKey(tripId),
    queryFn: () => api<TripDetail>(`/trips/${tripId}`),
    retry: retryServerErrors,
  });
}

export function useCreateTrip() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TripInput) => api<TripDetail>('/trips', { method: 'POST', body: input }),
    onSuccess: (trip) => {
      queryClient.setQueryData(tripKey(trip.id), trip);
      void queryClient.invalidateQueries({ queryKey: tripsKey });
    },
  });
}

export function useUpdateTrip(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TripUpdateInput) =>
      api<TripDetail>(`/trips/${tripId}`, { method: 'PUT', body: input }),
    onSuccess: (trip) => {
      queryClient.setQueryData(tripKey(trip.id), trip);
      void queryClient.invalidateQueries({ queryKey: tripsKey });
    },
  });
}

export function useDeleteTrip() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tripId: string) => api<void>(`/trips/${tripId}`, { method: 'DELETE' }),
    onSuccess: (_data, tripId) => {
      queryClient.setQueryData<TripSummary[]>(tripsKey, (trips) =>
        trips?.filter((t) => t.id !== tripId),
      );
      queryClient.removeQueries({ queryKey: tripKey(tripId) });
      void queryClient.invalidateQueries({ queryKey: tripsKey });
    },
  });
}
