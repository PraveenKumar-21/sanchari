import {
  type Activity,
  type Destination,
  MAX_ACTIVITIES_PER_DATE,
  type TripDay,
} from '@sanchari/shared';
import { ActivityInput } from './ActivityInput';
import { ActivityItem } from './ActivityItem';
import { dayElementId, dayTitle } from './days';

type Props = {
  day: TripDay<Destination>;
  activities: Activity[];
  onAdd: (text: string) => void;
  onSave: (activity: Activity, text: string) => void;
  onMove: (activity: Activity, direction: -1 | 1) => void;
  onDelete: (activity: Activity) => void;
};

/** A Day header and its ordered Activities (frontend-spec §4.5). */
export function DayCard({ day, activities, onAdd, onSave, onMove, onDelete }: Props) {
  const title = dayTitle(day);
  const headingId = `${dayElementId(day.date)}-heading`;
  return (
    <section
      id={dayElementId(day.date)}
      aria-labelledby={headingId}
      className="scroll-mt-20 rounded-xl border bg-card p-4 sm:p-5"
    >
      <h2 id={headingId} className="mb-3 font-medium">
        {title}
      </h2>
      {activities.length === 0 ? (
        <p className="mb-3 text-sm text-muted-foreground">Nothing planned yet</p>
      ) : (
        <ol className="mb-3 space-y-0.5">
          {activities.map((activity, index) => (
            <ActivityItem
              key={activity.id}
              activity={activity}
              index={index}
              isFirst={index === 0}
              isLast={index === activities.length - 1}
              onSave={(text) => onSave(activity, text)}
              onMove={(direction) => onMove(activity, direction)}
              onDelete={() => onDelete(activity)}
            />
          ))}
        </ol>
      )}
      <ActivityInput
        dayLabel={`Day ${day.dayNumber}`}
        disabled={activities.length >= MAX_ACTIVITIES_PER_DATE}
        onAdd={onAdd}
      />
    </section>
  );
}
