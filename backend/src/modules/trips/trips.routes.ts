import {
  dataEnvelope,
  tripDetailSchema,
  tripInputSchema,
  tripParamsSchema,
  tripSummarySchema,
  tripUpdateInputSchema,
} from '@sanchari/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { currentUser } from '../../plugins/auth';
import * as trips from './trips.service';

const tripResponse = dataEnvelope(tripDetailSchema);

// api-contract §7.2
export const tripRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', app.authenticate);

  app.get(
    '/',
    { schema: { response: { 200: dataEnvelope(z.array(tripSummarySchema)) } } },
    async (request) => ({
      data: await trips.listTrips(app.db, currentUser(request).id),
    }),
  );

  app.post(
    '/',
    { schema: { body: tripInputSchema, response: { 201: tripResponse } } },
    async (request, reply) => {
      const trip = await trips.createTrip(app.db, currentUser(request).id, request.body);
      return reply.code(201).header('Location', `/api/v1/trips/${trip.id}`).send({ data: trip });
    },
  );

  app.get(
    '/:tripId',
    { schema: { params: tripParamsSchema, response: { 200: tripResponse } } },
    async (request) => ({
      data: await trips.getTrip(app.db, currentUser(request).id, request.params.tripId),
    }),
  );

  app.put(
    '/:tripId',
    {
      schema: {
        params: tripParamsSchema,
        body: tripUpdateInputSchema,
        response: { 200: tripResponse },
      },
    },
    async (request) => ({
      data: await trips.updateTrip(
        app.db,
        currentUser(request).id,
        request.params.tripId,
        request.body,
      ),
    }),
  );

  app.delete('/:tripId', { schema: { params: tripParamsSchema } }, async (request, reply) => {
    await trips.deleteTrip(app.db, currentUser(request).id, request.params.tripId);
    return reply.code(204).send();
  });
};
