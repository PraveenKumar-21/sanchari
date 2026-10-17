import {
  activityCreateInputSchema,
  activityOrderInputSchema,
  activityParamsSchema,
  activityPatchInputSchema,
  activitySchema,
  dataEnvelope,
  dayParamsSchema,
  tripParamsSchema,
} from '@sanchari/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { currentUser } from '../../plugins/auth';
import * as service from './activities.service';

const activityResponse = dataEnvelope(activitySchema);

// api-contract §7.3 (mounted under /api/v1/trips)
export const activityRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', app.authenticate);

  app.post(
    '/:tripId/activities',
    {
      schema: {
        params: tripParamsSchema,
        body: activityCreateInputSchema,
        response: { 201: activityResponse },
      },
    },
    async (request, reply) => {
      const activity = await service.createActivity(
        app.db,
        currentUser(request).id,
        request.params.tripId,
        request.body,
      );
      return reply.code(201).send({ data: activity });
    },
  );

  app.patch(
    '/:tripId/activities/:activityId',
    {
      schema: {
        params: activityParamsSchema,
        body: activityPatchInputSchema,
        response: { 200: activityResponse },
      },
    },
    async (request) => ({
      data: await service.updateActivity(
        app.db,
        currentUser(request).id,
        request.params.tripId,
        request.params.activityId,
        request.body.text,
      ),
    }),
  );

  app.delete(
    '/:tripId/activities/:activityId',
    { schema: { params: activityParamsSchema } },
    async (request, reply) => {
      await service.deleteActivity(
        app.db,
        currentUser(request).id,
        request.params.tripId,
        request.params.activityId,
      );
      return reply.code(204).send();
    },
  );

  app.put(
    '/:tripId/days/:date/activity-order',
    {
      schema: {
        params: dayParamsSchema,
        body: activityOrderInputSchema,
        response: { 200: dataEnvelope(z.array(activitySchema)) },
      },
    },
    async (request) => ({
      data: await service.reorderActivities(
        app.db,
        currentUser(request).id,
        request.params.tripId,
        request.params.date,
        request.body.activityIds,
      ),
    }),
  );
};
