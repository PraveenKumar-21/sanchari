import { randomUUID } from 'node:crypto';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import Fastify, { type FastifyServerOptions } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import type { Config } from './config';
import type { Db } from './db/client';
import { authRoutes } from './modules/auth/auth.routes';
import { healthRoutes } from './modules/health/health.routes';
import { registerAuth } from './plugins/auth';
import { registerErrorHandling } from './plugins/errors';
import { registerOriginCheck } from './plugins/security';

declare module 'fastify' {
  interface FastifyInstance {
    config: Config;
    db: Db;
  }
}

export type BuildAppOptions = {
  config: Config;
  db: Db;
  logger?: FastifyServerOptions['logger'];
};

function defaultLogger(config: Config): FastifyServerOptions['logger'] {
  if (config.NODE_ENV === 'test') return false;
  return {
    level: config.LOG_LEVEL,
    redact: [
      'req.headers.cookie',
      'req.headers.authorization',
      'res.headers["set-cookie"]',
      '*.password',
    ],
    ...(config.NODE_ENV === 'development' && {
      transport: {
        target: 'pino-pretty',
        options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
      },
    }),
  };
}

export async function buildApp({ config, db, logger }: BuildAppOptions) {
  const app = Fastify({
    logger: logger ?? defaultLogger(config),
    trustProxy: config.trustProxy,
    bodyLimit: 100 * 1024,
    genReqId: () => randomUUID(),
    requestIdHeader: false,
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.decorate('config', config);
  app.decorate('db', db);

  // Request bodies must be JSON (api-contract §1); anything else gets 415.
  app.removeContentTypeParser(['text/plain']);

  app.addHook('onSend', async (request, reply) => {
    reply.header('X-Request-Id', request.id);
  });

  registerErrorHandling(app);
  await app.register(helmet);
  await app.register(cookie);
  registerOriginCheck(app);
  registerAuth(app);

  await app.register(healthRoutes, { prefix: '/api' });
  await app.register(authRoutes, { prefix: '/api/v1/auth' });

  return app;
}
