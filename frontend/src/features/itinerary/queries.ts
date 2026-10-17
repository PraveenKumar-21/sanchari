// Activity mutations with optimistic updates and rollback (frontend-spec §4.5, §6.2).
import type { Activity, IsoDate, TripDetail } from '@sanchari/shared';
import { type QueryClient, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError, api } from '@/lib/api/client';
import { tripKey } from '@/features/trips/queries';

export const TEMP_ID_PREFIX = 'temp-';
export const isTempId = (id: string) => id.startsWith(TEMP_ID_PREFIX);

/** Sorts by date then position, and renumbers each date's positions 0…n−1. */
function normalize(list: Activity[]): Activity[] {
  const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date) || a.position - b.position);
  const next = new Map<IsoDate, number>();
  return sorted.map((a) => {
    const position = next.get(a.date) ?? 0;
    next.set(a.date, position + 1);
    return a.position === position ? a : { ...a, position };
  });
}

type Snapshot = { previous?: TripDetail };

async function optimistic(
  queryClient: QueryClient,
  tripId: string,
  change: (activities: Activity[]) => Activity[],
): Promise<Snapshot> {
  await queryClient.cancelQueries({ queryKey: tripKey(tripId) });
  const previous = queryClient.getQueryData<TripDetail>(tripKey(tripId));
  if (previous) {
    queryClient.setQueryData<TripDetail>(tripKey(tripId), {
      ...previous,
      activities: normalize(change(previous.activities)),
    });
  }
  return { previous };
}

function useActivityMutation<TVars, TResult>(
  tripId: string,
  mutationFn: (vars: TVars) => Promise<TResult>,
  change: (activities: Activity[], vars: TVars) => Activity[],
  failureMessage: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onMutate: (vars: TVars) => optimistic(queryClient, tripId, (list) => change(list, vars)),
    onError: (err, _vars, snapshot) => {
      if (snapshot?.previous) queryClient.setQueryData(tripKey(tripId), snapshot.previous);
      if (err instanceof ApiError && err.code === 'UNAUTHORIZED') return; // handled globally
      if (err instanceof ApiError && err.code === 'CONFLICT') {
        toast.error('This trip changed elsewhere, please try again');
      } else if (err instanceof ApiError && err.code === 'LIMIT_REACHED') {
        toast.error(err.message);
      } else {
        toast.error(failureMessage);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: tripKey(tripId) }),
  });
}

export type AddActivityVars = { date: IsoDate; text: string; position?: number };

export function useAddActivity(tripId: string) {
  return useActivityMutation(
    tripId,
    (vars: AddActivityVars) =>
      api<Activity>(`/trips/${tripId}/activities`, { method: 'POST', body: vars }),
    (list, vars) => {
      const sameDay = list.filter((a) => a.date === vars.date).length;
      const position = Math.min(vars.position ?? sameDay, sameDay);
      const now = new Date().toISOString();
      const shifted = list.map((a) =>
        a.date === vars.date && a.position >= position ? { ...a, position: a.position + 1 } : a,
      );
      return [
        ...shifted,
        {
          id: `${TEMP_ID_PREFIX}${crypto.randomUUID()}`,
          date: vars.date,
          position,
          text: vars.text,
          createdAt: now,
          updatedAt: now,
        },
      ];
    },
    'Could not add the activity',
  );
}

export function useUpdateActivity(tripId: string) {
  return useActivityMutation(
    tripId,
    ({ id, text }: { id: string; text: string }) =>
      api<Activity>(`/trips/${tripId}/activities/${id}`, { method: 'PATCH', body: { text } }),
    (list, { id, text }) => list.map((a) => (a.id === id ? { ...a, text } : a)),
    'Could not save the activity',
  );
}

export function useDeleteActivity(tripId: string) {
  return useActivityMutation(
    tripId,
    (activity: Activity) =>
      api<void>(`/trips/${tripId}/activities/${activity.id}`, { method: 'DELETE' }),
    (list, activity) => list.filter((a) => a.id !== activity.id),
    'Could not delete the activity',
  );
}

export function useReorderActivities(tripId: string) {
  return useActivityMutation(
    tripId,
    ({ date, ids }: { date: IsoDate; ids: string[] }) =>
      api<Activity[]>(`/trips/${tripId}/days/${date}/activity-order`, {
        method: 'PUT',
        body: { activityIds: ids },
      }),
    (list, { ids }) => {
      const order = new Map(ids.map((id, i) => [id, i]));
      return list.map((a) => (order.has(a.id) ? { ...a, position: order.get(a.id)! } : a));
    },
    'Could not reorder the activities',
  );
}
