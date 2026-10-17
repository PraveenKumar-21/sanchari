import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { sql } from 'drizzle-orm';
import { AppError } from '../lib/app-error';

const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * CSRF guard (backend-spec §7, api-contract §2): state-changing requests must come from an
 * allowed Origin. SameSite=Lax cookies and JSON-only bodies cover the rest.
 */
export function registerOriginCheck(app: FastifyInstance) {
  const allowed = new Set(app.config.allowedOrigins);
  app.addHook('onRequest', async (request) => {
    if (!STATE_CHANGING.has(request.method)) return;
    const origin = request.headers.origin;
    if (!origin || !allowed.has(origin)) {
      throw new AppError(403, 'FORBIDDEN', 'Request origin not allowed');
    }
  });
}

type RateLimitRule = {
  name: string;
  max: number;
  windowSeconds: number;
  key: (request: FastifyRequest) => string;
};

/**
 * Fixed-window rate limit stored in Postgres, so it holds across serverless instances
 * (backend-spec §11). Use as a route preHandler (after body validation, so keys can use the body).
 */
export function rateLimit(app: FastifyInstance, rule: RateLimitRule) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const key = `${rule.name}:${rule.key(request)}`;
    const result = await app.db.execute<{ count: number; reset: number }>(sql`
      insert into rate_limits (key, window_start, count) values (${key}, now(), 1)
      on conflict (key) do update set
        count = case when rate_limits.window_start <= now() - make_interval(secs => ${rule.windowSeconds})
                     then 1 else rate_limits.count + 1 end,
        window_start = case when rate_limits.window_start <= now() - make_interval(secs => ${rule.windowSeconds})
                            then now() else rate_limits.window_start end
      returning count,
        ceil(extract(epoch from (window_start + make_interval(secs => ${rule.windowSeconds}) - now())))::int as reset
    `);
    const row = (result as unknown as { rows: { count: number; reset: number }[] }).rows[0]!;
    const count = Number(row.count);
    const reset = Math.max(Number(row.reset), 1);

    reply.header('x-ratelimit-limit', rule.max);
    reply.header('x-ratelimit-remaining', Math.max(rule.max - count, 0));
    reply.header('x-ratelimit-reset', reset);
    if (count > rule.max) {
      reply.header('retry-after', reset);
      throw new AppError(429, 'RATE_LIMITED', `Too many attempts, try again in ${reset} seconds`);
    }
  };
}
