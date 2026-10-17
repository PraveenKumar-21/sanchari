import { useNavigate } from 'react-router';
import { TripForm } from '@/features/trips/TripForm';
import { emptyTripForm } from '@/features/trips/utils';
import { handleTripFormError } from '@/features/trips/handleTripFormError';
import { useCreateTrip } from '@/features/trips/queries';

/** frontend-spec §4.4 (create) */
export function CreateTripPage() {
  const navigate = useNavigate();
  const createTrip = useCreateTrip();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold md:text-3xl">New trip</h1>
      <TripForm
        mode="create"
        defaultValues={emptyTripForm}
        pending={createTrip.isPending}
        onCancel={() => navigate('/trips')}
        onSubmit={async (values, setError) => {
          try {
            const trip = await createTrip.mutateAsync(values);
            navigate(`/trips/${trip.id}`, { replace: true });
          } catch (err) {
            handleTripFormError(err, setError);
          }
        }}
      />
    </div>
  );
}
