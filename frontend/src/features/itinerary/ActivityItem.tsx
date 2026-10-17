import { type Activity, activityTextSchema, MAX_ACTIVITY_LENGTH } from '@sanchari/shared';
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { type KeyboardEvent, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { isTempId } from './queries';

type Props = {
  activity: Activity;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  onSave: (text: string) => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
};

/** One Activity: shows, edits in place, moves and deletes (frontend-spec §4.5). */
export function ActivityItem({
  activity,
  index,
  isFirst,
  isLast,
  onSave,
  onMove,
  onDelete,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(activity.text);
  const [error, setError] = useState<string | null>(null);
  // Enter/Esc end editing; the input's unmount can still fire blur, which must not save again.
  const finished = useRef(false);
  const saving = isTempId(activity.id); // not yet confirmed by the server
  const errorId = `activity-${activity.id}-error`;

  const startEditing = () => {
    if (saving) return;
    setDraft(activity.text);
    setError(null);
    finished.current = false;
    setEditing(true);
  };

  const commit = () => {
    if (finished.current) return;
    const parsed = activityTextSchema.safeParse(draft);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid activity');
      return;
    }
    finished.current = true;
    setEditing(false);
    if (parsed.data !== activity.text) onSave(parsed.data);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      finished.current = true;
      setEditing(false);
    }
  };

  const label = `“${activity.text}”`;

  return (
    <li className="group flex items-start gap-2 rounded-md py-1">
      <span className="mt-2.5 w-5 shrink-0 text-right text-sm text-muted-foreground tabular-nums">
        {index + 1}.
      </span>
      <div className="min-w-0 flex-1">
        {editing ? (
          <>
            <Input
              autoFocus
              value={draft}
              maxLength={MAX_ACTIVITY_LENGTH}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              onBlur={commit}
              aria-label={`Edit activity ${index + 1}`}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? errorId : undefined}
            />
            {error && (
              <p id={errorId} className="mt-1 text-sm text-destructive">
                {error}
              </p>
            )}
          </>
        ) : (
          <button
            type="button"
            onClick={startEditing}
            disabled={saving}
            className="min-h-10 w-full rounded-md px-2 py-2 text-left break-words hover:bg-accent focus-visible:bg-accent disabled:cursor-wait disabled:opacity-70"
            aria-label={`Edit ${label}`}
          >
            {activity.text}
          </button>
        )}
      </div>
      {!editing && (
        <div className="flex shrink-0 items-center">
          <Button
            variant="ghost"
            size="icon"
            className="size-10"
            disabled={isFirst || saving}
            onClick={() => onMove(-1)}
            aria-label={`Move ${label} up`}
          >
            <ChevronUp />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-10"
            disabled={isLast || saving}
            onClick={() => onMove(1)}
            aria-label={`Move ${label} down`}
          >
            <ChevronDown />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-10 text-muted-foreground hover:text-destructive"
            disabled={saving}
            onClick={onDelete}
            aria-label={`Delete ${label}`}
          >
            <Trash2 />
          </Button>
        </div>
      )}
    </li>
  );
}
