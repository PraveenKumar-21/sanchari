import type { ReactNode } from 'react';
import { Label } from '@/components/ui/label';

/** Label + control + error message, wired up with aria-describedby (frontend-spec §10). */
export function FormField({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: (aria: {
    id: string;
    'aria-invalid': boolean;
    'aria-describedby'?: string;
  }) => ReactNode;
}) {
  const describedBy = [error && `${id}-error`, hint && `${id}-hint`].filter(Boolean).join(' ');
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children({
        id,
        'aria-invalid': Boolean(error),
        'aria-describedby': describedBy || undefined,
      })}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
