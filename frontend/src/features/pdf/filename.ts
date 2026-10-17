/** `<trip-name-slug>-itinerary.pdf`, e.g. `japan-spring-itinerary.pdf` (frontend-spec §4.6). */
export function itineraryFilename(tripName: string): string {
  const slug = tripName
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'trip'}-itinerary.pdf`;
}
