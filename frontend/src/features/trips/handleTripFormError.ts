import type { UseFormSetError } from 'react-hook-form';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api/client';
import { applyValidationErrors } from '@/lib/form-errors';
import type { TripFormValues } from './utils';

const isTripField = (path: string) =>
  path === 'name' ||
  path === 'tripType' ||
  path === 'destinations' ||
  path.startsWith('destinations.');

/** Maps API errors from POST/PUT /trips onto the form, or a toast (frontend-spec §11). */
export function handleTripFormError(err: unknown, setError: UseFormSetError<TripFormValues>) {
  if (!(err instanceof ApiError)) throw err;
  if (applyValidationErrors(err, setError, isTripField)) return;
  toast.error(err.message || 'Something went wrong');
}
