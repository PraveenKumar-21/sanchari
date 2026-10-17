import { todayLocal, type TripSummary } from '@sanchari/shared';
import { Plane, Plus } from 'lucide-react';
import { Link } from 'react-router';
import { EmptyState, ErrorState } from '@/components/layout/States';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useTrips } from '@/features/trips/queries';
import { TripCard } from '@/features/trips/TripCard';
import { useDeleteTripFlow } from '@/features/trips/useDeleteTripFlow';

function TripGrid({
  trips,
  onDelete,
}: {
  trips: TripSummary[];
  onDelete: (t: TripSummary) => void;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {trips.map((trip) => (
        <TripCard key={trip.id} trip={trip} onDelete={() => onDelete(trip)} />
      ))}
    </div>
  );
}

/** frontend-spec §4.3 */
export function TripListPage() {
  const { data: trips, isPending, isError, refetch } = useTrips();
  const deleteFlow = useDeleteTripFlow();

  const today = todayLocal();
  const upcoming = (trips ?? []).filter((t) => t.endDate >= today);
  const past = (trips ?? [])
    .filter((t) => t.endDate < today)
    .sort((a, b) => b.endDate.localeCompare(a.endDate));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold md:text-3xl">My Trips</h1>
        {trips && trips.length > 0 && (
          <Button asChild>
            <Link to="/trips/new">
              <Plus aria-hidden /> New Trip
            </Link>
          </Button>
        )}
      </div>

      {isPending ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" aria-busy>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : trips.length === 0 ? (
        <EmptyState
          icon={<Plane className="size-8 text-primary" aria-hidden />}
          title="No trips yet"
          description="Create a trip, add its destinations, and plan it day by day."
          action={
            <Button asChild>
              <Link to="/trips/new">Plan your first trip</Link>
            </Button>
          }
        />
      ) : (
        <>
          {upcoming.length > 0 && (
            <section className="space-y-3" aria-labelledby="upcoming-heading">
              <h2 id="upcoming-heading" className="text-lg font-medium">
                Upcoming &amp; ongoing
              </h2>
              <TripGrid trips={upcoming} onDelete={deleteFlow.ask} />
            </section>
          )}
          {past.length > 0 && (
            <section className="space-y-3" aria-labelledby="past-heading">
              <h2 id="past-heading" className="text-lg font-medium text-muted-foreground">
                Past
              </h2>
              <TripGrid trips={past} onDelete={deleteFlow.ask} />
            </section>
          )}
        </>
      )}
      {deleteFlow.dialog}
    </div>
  );
}
