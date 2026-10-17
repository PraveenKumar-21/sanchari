import { timingSafeEqual } from 'node:crypto';
import { lt, sql } from 'drizzle-orm';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { rateLimits, sessions } from '../../db/schema';
import { notFound } from '../../lib/app-error';

function hasCronSecret(request: FastifyRequest, secret: string | undefined): boolean {
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(request.headers.authorization ?? '');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * Daily maintenance, called by Vercel Cron with `Authorization: Bearer $CRON_SECRET`
 * (backend-spec §12). Not part of the public contract: anything else gets 404.
 */
export const cleanupRoutes: FastifyPluginAsync = async (app) => {
  app.get('/cleanup', async (request) => {
    if (!hasCronSecret(request, app.config.CRON_SECRET)) throw notFound();

    const expiredSessions = await app.db
      .delete(sessions)
      .where(lt(sessions.expiresAt, sql`now()`))
      .returning({ id: sessions.id });
    const staleLimits = await app.db
      .delete(rateLimits)
      .where(lt(rateLimits.windowStart, sql`now() - interval '1 day'`))
      .returning({ key: rateLimits.key });

    request.log.info(
      { sessions: expiredSessions.length, rateLimits: staleLimits.length },
      'cleanup done',
    );
    return {
      status: 'ok',
      deleted: { sessions: expiredSessions.length, rateLimits: staleLimits.length },
    };
  });
};
