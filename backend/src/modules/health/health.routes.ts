import { healthResponseSchema } from '@sanchari/shared';
import { sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

// api-contract §7.4 — unversioned, no { data } envelope.
export const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/health', { schema: { response: { 200: healthResponseSchema } } }, async () => ({
    status: 'ok' as const,
  }));

  app.get(
    '/health/ready',
    { schema: { response: { 200: healthResponseSchema, 503: healthResponseSchema } } },
    async (request, reply) => {
      try {
        await app.db.execute(sql`select 1`);
        return { status: 'ok' as const };
      } catch (err) {
        request.log.error({ err }, 'database not reachable');
        return reply.code(503).send({ status: 'unavailable' as const });
      }
    },
  );
};
