import { activityTextSchema, MAX_ACTIVITY_LENGTH } from '@sanchari/shared';
import { Plus } from 'lucide-react';
import { type FormEvent, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/** "Add activity" input: Enter adds, the input clears and keeps focus (frontend-spec §4.5). */
export function ActivityInput({
  dayLabel,
  disabled,
  onAdd,
}: {
  dayLabel: string;
  disabled?: boolean;
  onAdd: (text: string) => void;
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = `add-${dayLabel.replace(/\W+/g, '-')}`;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (text.trim() === '') return;
    const parsed = activityTextSchema.safeParse(text);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid activity');
      return;
    }
    onAdd(parsed.data);
    setText('');
    setError(null);
    inputRef.current?.focus();
  };

  return (
    <form onSubmit={submit} className="space-y-1">
      <div className="flex gap-2">
        <Input
          ref={inputRef}
          id={id}
          value={text}
          maxLength={MAX_ACTIVITY_LENGTH}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add activity"
          aria-label={`Add activity to ${dayLabel}`}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          disabled={disabled}
        />
        <Button type="submit" variant="secondary" disabled={disabled || text.trim() === ''}>
          <Plus aria-hidden />
          <span className="sr-only sm:not-sr-only">Add</span>
        </Button>
      </div>
      {error && (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
