/** Only internal paths, never `//evil.example` (open redirect guard, frontend-spec §8). */
export function safeReturnTo(value: string | null): string {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/trips';
}
