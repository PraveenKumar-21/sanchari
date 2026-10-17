import type { ValidationIssue } from '@sanchari/shared';
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiError } from './api/client';

/**
 * Puts a VALIDATION_ERROR's `details` onto matching form fields (frontend-spec §11).
 * Returns true if at least one issue landed on a field.
 */
export function applyValidationErrors<T extends FieldValues>(
  err: unknown,
  setError: UseFormSetError<T>,
  isField: (path: string) => boolean,
): boolean {
  if (!(err instanceof ApiError) || err.code !== 'VALIDATION_ERROR') return false;
  let applied = false;
  for (const issue of err.details as ValidationIssue[]) {
    if (issue?.path && isField(issue.path)) {
      setError(issue.path as Path<T>, { type: 'server', message: issue.message });
      applied = true;
    }
  }
  return applied;
}
