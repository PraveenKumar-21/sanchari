import type { User } from '@sanchari/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../lib/app-error';
import { SESSION_COOKIE } from '../lib/session-token';
import { getSessionUser } from '../modules/auth/auth.service';

declare module 'fastify' {
  interface FastifyRequest {
    user: User | null;
  }
  interface FastifyInstance {
    /** preHandler: requires a valid Session and sets request.user (backend-spec §7). */
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    setSessionCookie: (reply: FastifyReply, token: string) => void;
    clearSessionCookie: (reply: FastifyReply) => void;
  }
}

export function registerAuth(app: FastifyInstance) {
  const ttlDays = app.config.SESSION_TTL_DAYS;
  const cookieOptions = {
    httpOnly: true,
    secure: app.config.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
  };

  app.decorateRequest('user', null);

  app.decorate('setSessionCookie', (reply: FastifyReply, token: string) => {
    reply.setCookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: ttlDays * 86_400 });
  });

  app.decorate('clearSessionCookie', (reply: FastifyReply) => {
    reply.clearCookie(SESSION_COOKIE, cookieOptions);
  });

  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    const token = request.cookies[SESSION_COOKIE];
    const session = token ? await getSessionUser(app.db, token, ttlDays) : null;
    if (!token || !session) {
      throw new AppError(401, 'UNAUTHORIZED', 'Please log in');
    }
    if (session.renewed) app.setSessionCookie(reply, token);
    request.user = session.user;
  });
}

/** The authenticated User; only valid after the `authenticate` preHandler. */
export function currentUser(request: FastifyRequest): User {
  if (!request.user) throw new AppError(401, 'UNAUTHORIZED', 'Please log in');
  return request.user;
}
