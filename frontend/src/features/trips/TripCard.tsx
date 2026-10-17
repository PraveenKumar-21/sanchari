import type { TripSummary } from '@sanchari/shared';
import { CalendarDays, MapPin, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatRange, pluralize } from '@/lib/format';
import { TripTypeBadge } from './TripTypeBadge';
import { destinationChain } from './utils';

export function TripCard({ trip, onDelete }: { trip: TripSummary; onDelete: () => void }) {
  const navigate = useNavigate();
  return (
    <Card className="relative gap-3 transition-colors hover:border-primary/50 focus-within:border-primary/50">
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div className="min-w-0 space-y-2">
          <CardTitle className="truncate text-lg">
            {/* The link covers the whole card; the menu sits above it. */}
            <Link
              to={`/trips/${trip.id}`}
              className="after:absolute after:inset-0 focus-visible:outline-none"
            >
              {trip.name}
            </Link>
          </CardTitle>
          <TripTypeBadge tripType={trip.tripType} />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="relative z-10 -mr-2 size-11 shrink-0"
              aria-label={`Actions for ${trip.name}`}
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => navigate(`/trips/${trip.id}/edit`)}>
              <Pencil aria-hidden /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
              <Trash2 aria-hidden /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent className="space-y-1.5 text-sm text-muted-foreground">
        <p className="flex items-center gap-2">
          <MapPin className="size-4 shrink-0" aria-hidden />
          <span className="truncate">{destinationChain(trip)}</span>
        </p>
        <p className="flex items-center gap-2">
          <CalendarDays className="size-4 shrink-0" aria-hidden />
          <span>
            {formatRange(trip.startDate, trip.endDate)} · {pluralize(trip.dayCount, 'day')}
          </span>
        </p>
      </CardContent>
    </Card>
  );
}
