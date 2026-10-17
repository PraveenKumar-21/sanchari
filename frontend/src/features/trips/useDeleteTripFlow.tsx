import type { TripSummary } from '@sanchari/shared';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/layout/ConfirmDialog';
import { useDeleteTrip } from './queries';

/** Delete with confirmation (frontend-spec §4.3). Render `dialog` once; call `ask(trip)` to start. */
export function useDeleteTripFlow(onDeleted?: () => void) {
  const [target, setTarget] = useState<Pick<TripSummary, 'id' | 'name'> | null>(null);
  const deleteTrip = useDeleteTrip();

  const dialog = (
    <ConfirmDialog
      open={target !== null}
      onOpenChange={(open) => !open && setTarget(null)}
      title={`Delete ${target?.name ?? 'trip'}?`}
      description="This removes all its days and activities. This can't be undone."
      confirmLabel="Delete"
      destructive
      pending={deleteTrip.isPending}
      onConfirm={() => {
        if (!target) return;
        deleteTrip.mutate(target.id, {
          onSuccess: () => {
            toast.success('Trip deleted');
            setTarget(null);
            onDeleted?.();
          },
          onError: () => toast.error('Could not delete the trip, please try again'),
        });
      }}
    />
  );

  return { ask: setTarget, dialog };
}
