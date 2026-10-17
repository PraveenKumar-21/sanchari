import type { TripDetail } from '@sanchari/shared';
import { CalendarDays, MapPin, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatRange, pluralize } from '@/lib/format';
import { TripTypeBadge } from './TripTypeBadge';

/** Trip summary and page actions (frontend-spec §4.5). `primaryAction` is e.g. Export PDF. */
export function TripHeader({
  trip,
  onDelete,
  primaryAction,
}: {
  trip: TripDetail;
  onDelete: () => void;
  primaryAction?: ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold break-words md:text-3xl">{trip.name}</h1>
          <TripTypeBadge tripType={trip.tripType} />
        </div>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CalendarDays className="size-4 shrink-0" aria-hidden />
          {formatRange(trip.startDate, trip.endDate)} · {pluralize(trip.dayCount, 'day')}
        </p>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <MapPin className="size-4 shrink-0" aria-hidden />
          <span className="break-words">{trip.destinations.map((d) => d.name).join(' → ')}</span>
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {primaryAction}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="size-11" aria-label="Trip actions">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => navigate(`/trips/${trip.id}/edit`)}>
              <Pencil aria-hidden /> Edit trip
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
              <Trash2 aria-hidden /> Delete trip
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
