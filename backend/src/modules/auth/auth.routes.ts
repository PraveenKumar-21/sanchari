import { dataEnvelope, loginInputSchema, signupInputSchema, userSchema } from '@sanchari/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { currentUser } from '../../plugins/auth';
import { rateLimit } from '../../plugins/security';
import { SESSION_COOKIE } from '../../lib/session-token';
import * as auth from './auth.service';

const userResponse = dataEnvelope(userSchema);

// api-contract §7.1
export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  const ttlDays = app.config.SESSION_TTL_DAYS;

  app.post(
    '/signup',
    {
      schema: { body: signupInputSchema, response: { 201: userResponse } },
      preHandler: rateLimit(app, {
        name: 'signup',
        max: 5,
        windowSeconds: 3600,
        key: (req) => req.ip,
      }),
    },
    async (request, reply) => {
      const { user, token } = await auth.signup(app.db, request.body, ttlDays);
      app.setSessionCookie(reply, token);
      return reply.code(201).send({ data: user });
    },
  );

  app.post(
    '/login',
    {
      schema: { body: loginInputSchema, response: { 200: userResponse } },
      preHandler: rateLimit(app, {
        name: 'login',
        max: 10,
        windowSeconds: 60,
        key: (req) => `${req.ip}:${(req.body as { username: string }).username}`,
      }),
    },
    async (request, reply) => {
      const { user, token } = await auth.login(app.db, request.body, ttlDays);
      const previous = request.cookies[SESSION_COOKIE];
      if (previous) await auth.logout(app.db, previous);
      app.setSessionCookie(reply, token);
      return { data: user };
    },
  );

  app.post('/logout', async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    if (token) await auth.logout(app.db, token);
    app.clearSessionCookie(reply);
    return reply.code(204).send();
  });

  app.get(
    '/me',
    { schema: { response: { 200: userResponse } }, preHandler: app.authenticate },
    async (request) => ({ data: currentUser(request) }),
  );
};
