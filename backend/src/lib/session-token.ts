// Session tokens (backend-spec §7): 32 random bytes in base64url go to the browser;
// only their SHA-256 hex is stored, so a leaked sessions table can't be used as cookies.
import { createHash, randomBytes } from 'node:crypto';

export const SESSION_COOKIE = 'sanchari_session';

export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
