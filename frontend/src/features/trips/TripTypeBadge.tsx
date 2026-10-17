import { TRIP_TYPE_LABELS, type TripType } from '@sanchari/shared';
import { Badge } from '@/components/ui/badge';

export function TripTypeBadge({ tripType }: { tripType: TripType }) {
  return (
    <Badge variant="secondary" className="bg-primary/10 text-primary">
      {TRIP_TYPE_LABELS[tripType]}
    </Badge>
  );
}
