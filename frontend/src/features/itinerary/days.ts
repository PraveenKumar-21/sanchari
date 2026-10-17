import type { Destination, TripDay } from '@sanchari/shared';
import { formatDay } from '@/lib/format';

export const dayElementId = (date: string) => `day-${date}`;

/** "Day 3 · Sun 14 Mar · Kyoto → Osaka" (Travel Day) */
export function dayTitle(day: TripDay<Destination>) {
  const where = day.destinations.map((d) => d.name).join(' → ');
  return `Day ${day.dayNumber} · ${formatDay(day.date)}${where ? ` · ${where}` : ''}`;
}
