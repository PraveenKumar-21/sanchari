import { Link, useNavigate, useParams } from 'react-router';
import { ErrorState } from '@/components/layout/States';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
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

/** frontend-spec §4.5. Phase 4 adds the Day cards and Activities. */
export function ItineraryPage() {
  const { tripId = '' } = useParams();
  const navigate = useNavigate();
  const { data: trip, isPending, error, refetch } = useTrip(tripId);
  const deleteFlow = useDeleteTripFlow(() => navigate('/trips', { replace: true }));

  if (isPending) {
    return (
      <div className="space-y-4" aria-busy>
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }
  if (error instanceof ApiError && error.status === 404) return <TripNotFound />;
  if (!trip) return <ErrorState onRetry={() => void refetch()} />;

  return (
    <div className="space-y-6">
      <TripHeader trip={trip} onDelete={() => deleteFlow.ask(trip)} />
      <p className="text-muted-foreground">Day-by-day planning is coming next.</p>
      {deleteFlow.dialog}
    </div>
  );
}
