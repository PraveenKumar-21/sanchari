import { type Activity, listTripDates, type TripDetail } from '@sanchari/shared';
import { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { ErrorState } from '@/components/layout/States';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { DayCard } from '@/features/itinerary/DayCard';
import { DayNav } from '@/features/itinerary/DayNav';
import {
  useAddActivity,
  useDeleteActivity,
  useReorderActivities,
  useUpdateActivity,
} from '@/features/itinerary/queries';
import { useTrip } from '@/features/trips/queries';
import { TripHeader } from '@/features/trips/TripHeader';
import { useDeleteTripFlow } from '@/features/trips/useDeleteTripFlow';
import { ApiError } from '@/lib/api/client';

export function TripNotFound() {
  return (
    <div className="space-y-4 py-12 text-center">
      <h1 className="text-2xl font-semibold">We couldn't find that trip</h1>
      <Button asChild>
        <Link to="/trips">Back to my trips</Link>
      </Button>
    </div>
  );
}

function Itinerary({ trip }: { trip: TripDetail }) {
  const navigate = useNavigate();
  const deleteFlow = useDeleteTripFlow(() => navigate('/trips', { replace: true }));
  const addActivity = useAddActivity(trip.id);
  const updateActivity = useUpdateActivity(trip.id);
  const deleteActivity = useDeleteActivity(trip.id);
  const reorder = useReorderActivities(trip.id);

  const days = useMemo(() => listTripDates(trip.destinations), [trip.destinations]);
  const byDate = useMemo(() => Map.groupBy(trip.activities, (a) => a.date), [trip.activities]);

  const move = (activity: Activity, direction: -1 | 1) => {
    const ids = (byDate.get(activity.date) ?? []).map((a) => a.id);
    const from = ids.indexOf(activity.id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to]!, ids[from]!];
    reorder.mutate({ date: activity.date, ids });
  };

  const remove = (activity: Activity) => {
    deleteActivity.mutate(activity, {
      onSuccess: () => {
        // Undo re-creates it at its old position (api-contract §7.3).
        toast('Activity deleted', {
          duration: 5000,
          action: {
            label: 'Undo',
            onClick: () =>
              addActivity.mutate({
                date: activity.date,
                text: activity.text,
                position: activity.position,
              }),
          },
        });
      },
    });
  };

  return (
    <div className="space-y-6">
      <TripHeader trip={trip} onDelete={() => deleteFlow.ask(trip)} />
      <div className="grid gap-4 lg:grid-cols-[11rem_1fr] lg:gap-8">
        <DayNav days={days} />
        <div className="space-y-4">
          {days.map((day) => (
            <DayCard
              key={day.date}
              day={day}
              activities={byDate.get(day.date) ?? []}
              onAdd={(text) => addActivity.mutate({ date: day.date, text })}
              onSave={(activity, text) => updateActivity.mutate({ id: activity.id, text })}
              onMove={move}
              onDelete={remove}
            />
          ))}
        </div>
      </div>
      {deleteFlow.dialog}
    </div>
  );
}

/** frontend-spec §4.5 */
export function ItineraryPage() {
  const { tripId = '' } = useParams();
  const { data: trip, isPending, error, refetch } = useTrip(tripId);

  if (isPending) {
    return (
      <div className="space-y-4" aria-busy>
        <Skeleton className="h-20 rounded-xl" />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
    );
  }
  if (error instanceof ApiError && error.status === 404) return <TripNotFound />;
  if (!trip) return <ErrorState onRetry={() => void refetch()} />;
  return <Itinerary trip={trip} />;
}
