// Display formatting for 'YYYY-MM-DD' dates. Formats in UTC from the date's own components,
// so the viewer's time zone can never shift the day (frontend-spec §6.4).
import type { IsoDate } from '@sanchari/shared';

function toUtcDate(date: IsoDate): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

const formatter = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...options });

const dayFmt = formatter({ weekday: 'short', day: 'numeric', month: 'short' });
const dateFmt = formatter({ day: 'numeric', month: 'short', year: 'numeric' });
const dayMonthFmt = formatter({ day: 'numeric', month: 'short' });
const longFmt = formatter({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

/** "Sat 14 Mar" */
export const formatDay = (date: IsoDate) => dayFmt.format(toUtcDate(date));
/** "14 Mar 2027" */
export const formatDate = (date: IsoDate) => dateFmt.format(toUtcDate(date));
/** "Sunday, 14 March 2027" */
export const formatLongDate = (date: IsoDate) => longFmt.format(toUtcDate(date));

/** "12 – 16 Mar 2027", "28 Mar – 2 Apr 2027", "28 Dec 2027 – 2 Jan 2028" */
export function formatRange(start: IsoDate, end: IsoDate): string {
  if (start === end) return formatDate(start);
  const [sy, sm] = start.split('-');
  const [ey, em] = end.split('-');
  const endText = formatDate(end);
  if (sy !== ey) return `${formatDate(start)} – ${endText}`;
  if (sm !== em) return `${dayMonthFmt.format(toUtcDate(start))} – ${endText}`;
  return `${Number(start.slice(8))} – ${endText}`;
}

export const pluralize = (n: number, singular: string, plural = `${singular}s`) =>
  `${n} ${n === 1 ? singular : plural}`;
