import type { Destination, TripDay } from '@sanchari/shared';
import { formatDay } from '@/lib/format';
import { dayElementId } from './days';

function jumpTo(date: string) {
  const el = document.getElementById(dayElementId(date));
  if (!el) return;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  el.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true });
}

/** Jump-to-Day navigation: a sticky sidebar at lg, a scrollable strip below (frontend-spec §4.5). */
export function DayNav({ days }: { days: TripDay<Destination>[] }) {
  return (
    <nav aria-label="Days" className="lg:sticky lg:top-6 lg:self-start">
      <ol className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 lg:mx-0 lg:max-h-[calc(100dvh-3rem)] lg:flex-col lg:gap-0.5 lg:overflow-y-auto lg:px-0">
        {days.map((day) => (
          <li key={day.date} className="shrink-0">
            <button
              type="button"
              onClick={() => jumpTo(day.date)}
              className="min-h-10 rounded-full border px-3 py-1.5 text-sm whitespace-nowrap hover:bg-accent lg:w-full lg:rounded-md lg:border-0 lg:text-left"
            >
              <span className="font-medium">Day {day.dayNumber}</span>
              <span className="ml-1.5 text-muted-foreground">{formatDay(day.date)}</span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
