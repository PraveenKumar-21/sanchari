import {
  type ActivitiesWouldBeDeletedDetail,
  dayNumber,
  type TripDetail,
  type TripInputParsed,
} from '@sanchari/shared';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ConfirmDialog } from '@/components/layout/ConfirmDialog';
import { ErrorState } from '@/components/layout/States';
import { Skeleton } from '@/components/ui/skeleton';
import { handleTripFormError } from '@/features/trips/handleTripFormError';
import { useTrip, useUpdateTrip } from '@/features/trips/queries';
import { TripForm } from '@/features/trips/TripForm';
import type { TripFormValues } from '@/features/trips/utils';
import { ApiError } from '@/lib/api/client';
import { formatDay, pluralize } from '@/lib/format';
import { TripNotFound } from './ItineraryPage';

const toFormValues = (trip: TripDetail): TripFormValues => ({
  name: trip.name,
  tripType: trip.tripType,
  destinations: trip.destinations.map((d) => ({ ...d })),
});

/** frontend-spec §4.4 (edit) and §7.4 (shrinking dates). */
export function EditTripPage() {
  const { tripId = '' } = useParams();
  const navigate = useNavigate();
  const { data: trip, isPending, error, refetch } = useTrip(tripId);
  const updateTrip = useUpdateTrip(tripId);
  const [pendingConfirm, setPendingConfirm] = useState<{
    values: TripInputParsed;
    details: ActivitiesWouldBeDeletedDetail[];
  } | null>(null);

  const back = () => navigate(`/trips/${tripId}`);

  if (isPending) return <Skeleton className="mx-auto h-96 max-w-3xl rounded-xl" />;
  if (error instanceof ApiError && error.status === 404) return <TripNotFound />;
  if (!trip) return <ErrorState onRetry={() => void refetch()} />;

  const save = async (values: TripInputParsed, confirmDeleteActivities = false) => {
    await updateTrip.mutateAsync({ ...values, confirmDeleteActivities });
    back();
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold md:text-3xl">Edit trip</h1>
      <TripForm
        mode="edit"
        defaultValues={toFormValues(trip)}
        pending={updateTrip.isPending}
        onCancel={back}
        onSubmit={async (values, setError) => {
          try {
            await save(values);
          } catch (err) {
            // The server refuses to drop dates that have Activities until we confirm (BR-12).
            if (err instanceof ApiError && err.code === 'ACTIVITIES_WOULD_BE_DELETED') {
              setPendingConfirm({
                values,
                details: err.details as ActivitiesWouldBeDeletedDetail[],
              });
              return;
            }
            handleTripFormError(err, setError);
          }
        }}
      />

      <ConfirmDialog
        open={pendingConfirm !== null}
        onOpenChange={(open) => !open && setPendingConfirm(null)}
        title="Delete activities on removed days?"
        description={
          <div className="space-y-2">
            <p>These days are no longer part of the trip:</p>
            <ul className="list-disc space-y-1 pl-5">
              {pendingConfirm?.details.map((d) => (
                <li key={d.date}>
                  Day {dayNumber(trip.startDate, d.date)} · {formatDay(d.date)} —{' '}
                  {pluralize(d.count, 'activity', 'activities')} will be deleted
                </li>
              ))}
            </ul>
          </div>
        }
        confirmLabel="Delete and save"
        destructive
        pending={updateTrip.isPending}
        onConfirm={() => {
          if (!pendingConfirm) return;
          save(pendingConfirm.values, true)
            .then(() => setPendingConfirm(null))
            .catch((err: unknown) => {
              setPendingConfirm(null);
              handleTripFormError(err, () => {});
            });
        }}
      />
    </div>
  );
}
