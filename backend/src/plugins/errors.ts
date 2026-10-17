import type { FastifyError, FastifyInstance, FastifyReply } from 'fastify';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';
import { AppError } from '../lib/app-error';

type ErrorBody = { error: { code: string; message: string; details: unknown[] } };

function send(
  reply: FastifyReply,
  status: number,
  code: string,
  message: string,
  details: unknown[] = [],
) {
  const body: ErrorBody = { error: { code, message, details } };
  return reply.code(status).type('application/json; charset=utf-8').send(body);
}

/** Fastify's own client errors, mapped onto contract codes (api-contract §4). */
const FASTIFY_CODES: Record<string, { status: number; code: string; message: string }> = {
  FST_ERR_CTP_BODY_TOO_LARGE: {
    status: 413,
    code: 'PAYLOAD_TOO_LARGE',
    message: 'Request body is too large',
  },
  FST_ERR_CTP_INVALID_MEDIA_TYPE: {
    status: 415,
    code: 'UNSUPPORTED_MEDIA_TYPE',
    message: 'Content-Type must be application/json',
  },
  FST_ERR_CTP_INVALID_CONTENT_LENGTH: {
    status: 400,
    code: 'VALIDATION_ERROR',
    message: 'Invalid request body',
  },
  FST_ERR_CTP_EMPTY_JSON_BODY: {
    status: 400,
    code: 'VALIDATION_ERROR',
    message: 'Request body is empty',
  },
};

export function registerErrorHandling(app: FastifyInstance) {
  app.setNotFoundHandler((_request, reply) => send(reply, 404, 'NOT_FOUND', 'Not found'));

  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      const context = error.validationContext ?? 'body';
      const details = error.validation.map((issue) => {
        const field = issue.instancePath.replace(/^\//, '').replaceAll('/', '.');
        const path = context === 'body' ? field : [context, field].filter(Boolean).join('.');
        return { path, message: issue.message ?? 'Invalid value' };
      });
      return send(reply, 400, 'VALIDATION_ERROR', 'Some fields are invalid', details);
    }

    if (error instanceof AppError) {
      return send(reply, error.statusCode, error.code, error.message, error.details);
    }

    const known = error.code ? FASTIFY_CODES[error.code] : undefined;
    if (known) return send(reply, known.status, known.code, known.message);

    // Malformed JSON and other 4xx raised by Fastify itself.
    if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
      return send(reply, 400, 'VALIDATION_ERROR', 'Malformed request');
    }

    request.log.error({ err: error }, 'unhandled error');
    return send(reply, 500, 'INTERNAL_ERROR', 'Something went wrong');
  });
}
