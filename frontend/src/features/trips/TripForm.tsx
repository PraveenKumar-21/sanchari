import { zodResolver } from '@hookform/resolvers/zod';
import {
  dayCount,
  isValidDate,
  MAX_DESTINATIONS,
  TRIP_TYPE_LABELS,
  TRIP_TYPES,
  type TripInputParsed,
  tripDates,
  tripInputSchema,
} from '@sanchari/shared';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import {
  Controller,
  type Resolver,
  type UseFormSetError,
  useFieldArray,
  useForm,
  useWatch,
} from 'react-hook-form';
import { FormField } from '@/components/layout/FormField';
import { ConfirmDialog } from '@/components/layout/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { formatRange, pluralize } from '@/lib/format';
import type { TripFormValues } from './utils';

/** Rows with a start date come first, in start-date order; rows without one keep their place last. */
function sortRows(rows: TripFormValues['destinations']) {
  return [...rows].sort((a, b) => {
    const ka = a.startDate || '9999-12-31';
    const kb = b.startDate || '9999-12-31';
    return ka.localeCompare(kb) || (a.endDate || '9999').localeCompare(b.endDate || '9999');
  });
}

function summary(rows: TripFormValues['destinations']) {
  const complete = rows.filter(
    (d) => isValidDate(d.startDate) && isValidDate(d.endDate) && d.endDate >= d.startDate,
  );
  if (complete.length === 0 || complete.length !== rows.length) return null;
  const range = tripDates(complete)!;
  return `${pluralize(dayCount(range.startDate, range.endDate), 'day')} · ${formatRange(range.startDate, range.endDate)}`;
}

type Props = {
  mode: 'create' | 'edit';
  defaultValues: TripFormValues;
  pending: boolean;
  /** Receives the parsed (trimmed, sorted) input, and `setError` for API errors. */
  onSubmit: (
    values: TripInputParsed,
    setError: UseFormSetError<TripFormValues>,
  ) => Promise<void> | void;
  onCancel: () => void;
};

function useTripForm(defaultValues: TripFormValues) {
  return useForm<TripFormValues, unknown, TripInputParsed>({
    resolver: zodResolver(tripInputSchema) as unknown as Resolver<
      TripFormValues,
      unknown,
      TripInputParsed
    >,
    mode: 'onTouched',
    defaultValues,
  });
}

/** Create / Edit Trip form (frontend-spec §4.4). */
export function TripForm({ mode, defaultValues, pending, onSubmit, onCancel }: Props) {
  const form = useTripForm(defaultValues);
  const { errors, isDirty } = form.formState;
  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: 'destinations',
  });
  const rows = useWatch({ control: form.control, name: 'destinations' }) ?? [];
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  // Keep rows in start-date order so error paths (sorted indexes, api-contract §7.2) line up.
  const resort = () => {
    const current = form.getValues('destinations');
    const sorted = sortRows(current);
    if (sorted.some((row, i) => row !== current[i])) replace(sorted);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    resort();
    void form.handleSubmit((values) => onSubmit(values, form.setError))();
  };

  const addDestination = () => {
    const last = form.getValues('destinations').at(-1);
    append({ name: '', startDate: last?.endDate ?? '', endDate: '' }, { shouldFocus: true });
  };

  const destinationsError = errors.destinations?.message ?? errors.destinations?.root?.message;
  const summaryText = summary(rows);

  return (
    <form onSubmit={submit} noValidate className="space-y-8">
      <section className="space-y-4" aria-labelledby="details-heading">
        <h2 id="details-heading" className="text-lg font-medium">
          Trip details
        </h2>
        <FormField id="trip-name" label="Trip name" error={errors.name?.message}>
          {(aria) => <Input {...aria} placeholder="e.g. Japan Spring" {...form.register('name')} />}
        </FormField>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Trip type</legend>
          <Controller
            control={form.control}
            name="tripType"
            render={({ field }) => (
              <RadioGroup
                value={field.value}
                onValueChange={(v) => field.onChange(v)}
                onBlur={field.onBlur}
                className="grid grid-cols-2 gap-2 sm:grid-cols-4"
                aria-invalid={Boolean(errors.tripType)}
                aria-describedby={errors.tripType ? 'trip-type-error' : undefined}
              >
                {TRIP_TYPES.map((type) => (
                  <Label
                    key={type}
                    htmlFor={`trip-type-${type}`}
                    className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
                  >
                    <RadioGroupItem id={`trip-type-${type}`} value={type} />
                    {TRIP_TYPE_LABELS[type]}
                  </Label>
                ))}
              </RadioGroup>
            )}
          />
          {errors.tripType && (
            <p id="trip-type-error" className="text-sm text-destructive">
              {errors.tripType.message}
            </p>
          )}
        </fieldset>
      </section>

      <section className="space-y-4" aria-labelledby="destinations-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="destinations-heading" className="text-lg font-medium">
            Destinations
          </h2>
          {summaryText && (
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {summaryText}
            </p>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Each destination starts on the previous one's last day (a travel day) or the day after.
        </p>

        <ol className="space-y-3">
          {fields.map((field, index) => {
            const rowErrors = errors.destinations?.[index];
            return (
              <li key={field.id} className="rounded-lg border p-3 sm:p-4">
                <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-start">
                  <FormField
                    id={`dest-${index}-name`}
                    label={`Destination ${index + 1}`}
                    error={rowErrors?.name?.message}
                  >
                    {(aria) => (
                      <Input
                        {...aria}
                        placeholder="City or region"
                        {...form.register(`destinations.${index}.name`)}
                      />
                    )}
                  </FormField>
                  <FormField
                    id={`dest-${index}-start`}
                    label="Start date"
                    error={rowErrors?.startDate?.message}
                  >
                    {(aria) => (
                      <Input
                        {...aria}
                        type="date"
                        {...form.register(`destinations.${index}.startDate`, { onBlur: resort })}
                      />
                    )}
                  </FormField>
                  <FormField
                    id={`dest-${index}-end`}
                    label="End date"
                    error={rowErrors?.endDate?.message}
                  >
                    {(aria) => (
                      <Input
                        {...aria}
                        type="date"
                        min={rows[index]?.startDate || undefined}
                        {...form.register(`destinations.${index}.endDate`, { onBlur: resort })}
                      />
                    )}
                  </FormField>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-11 justify-self-end sm:mt-6"
                    disabled={fields.length === 1}
                    onClick={() => remove(index)}
                    aria-label={`Remove destination ${index + 1}`}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </li>
            );
          })}
        </ol>

        {destinationsError && (
          <p role="alert" className="text-sm text-destructive">
            {destinationsError}
          </p>
        )}

        {fields.length < MAX_DESTINATIONS && (
          <Button type="button" variant="outline" onClick={addDestination}>
            <Plus aria-hidden /> Add destination
          </Button>
        )}
      </section>

      <div className="flex flex-col-reverse gap-2 border-t pt-6 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="ghost"
          onClick={() => (isDirty ? setConfirmDiscard(true) : onCancel())}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {mode === 'create' ? 'Create trip' : 'Save changes'}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="Discard changes?"
        description="Your changes to this trip haven't been saved."
        confirmLabel="Discard"
        destructive
        onConfirm={onCancel}
      />
    </form>
  );
}
