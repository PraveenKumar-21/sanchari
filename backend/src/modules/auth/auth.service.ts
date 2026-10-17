import type { LoginInput, SignupInput, User } from '@sanchari/shared';
import { and, eq, gt, lt, sql } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { sessions, users } from '../../db/schema';
import { AppError } from '../../lib/app-error';
import { isUniqueViolation } from '../../lib/db-errors';
import { hashPassword, verifyPassword } from '../../lib/password';
import { generateSessionToken, hashSessionToken } from '../../lib/session-token';

const DAY_MS = 86_400_000;

type UserRow = typeof users.$inferSelect;

export function toUser(row: Pick<UserRow, 'id' | 'username' | 'createdAt'>): User {
  return { id: row.id, username: row.username, createdAt: row.createdAt.toISOString() };
}

async function createSession(db: Db, userId: string, ttlDays: number) {
  const token = generateSessionToken();
  await db.insert(sessions).values({
    id: hashSessionToken(token),
    userId,
    expiresAt: new Date(Date.now() + ttlDays * DAY_MS),
  });
  return token;
}

export async function signup(db: Db, input: SignupInput, ttlDays: number) {
  const passwordHash = await hashPassword(input.password);
  let row: UserRow;
  try {
    [row] = (await db
      .insert(users)
      .values({ username: input.username, passwordHash })
      .returning()) as [UserRow];
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError(409, 'USERNAME_TAKEN', 'Username is already taken');
    }
    throw err;
  }
  const token = await createSession(db, row.id, ttlDays);
  return { user: toUser(row), token };
}

export async function login(db: Db, input: LoginInput, ttlDays: number) {
  const row = await db.query.users.findFirst({ where: eq(users.username, input.username) });
  const ok = await verifyPassword(row?.passwordHash, input.password);
  if (!row || !ok) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Incorrect username or password');
  }
  // Lazy cleanup of this User's expired Sessions (backend-spec §12).
  await db
    .delete(sessions)
    .where(and(eq(sessions.userId, row.id), lt(sessions.expiresAt, sql`now()`)));
  const token = await createSession(db, row.id, ttlDays);
  return { user: toUser(row), token };
}

/**
 * Resolves a session token to its User. When less than half the lifetime remains, the expiry is
 * pushed back to a full TTL and `renewed` is true, so the caller re-sends the cookie.
 */
export async function getSessionUser(db: Db, token: string, ttlDays: number) {
  const id = hashSessionToken(token);
  const [found] = await db
    .select({ user: users, expiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, sql`now()`)))
    .limit(1);
  if (!found) return null;

  const ttlMs = ttlDays * DAY_MS;
  const renewed = found.expiresAt.getTime() - Date.now() < ttlMs / 2;
  if (renewed) {
    await db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() + ttlMs) })
      .where(eq(sessions.id, id));
  }
  return { user: toUser(found.user), renewed };
}

export async function logout(db: Db, token: string) {
  await db.delete(sessions).where(eq(sessions.id, hashSessionToken(token)));
}
