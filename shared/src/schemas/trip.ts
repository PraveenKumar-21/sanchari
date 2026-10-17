import { z } from 'zod';
import { MAX_DESTINATIONS, MAX_NAME_LENGTH, TRIP_TYPES } from '../constants';
import { sortDestinations } from '../dates';
import { validateDestinationSequence } from '../destinations';
import { activitySchema } from './activity';
import { idSchema, isoDateSchema, timestampSchema, trimmedString } from './common';

export const tripTypeSchema = z.enum(TRIP_TYPES);

export const destinationInputSchema = z.strictObject({
  name: trimmedString(MAX_NAME_LENGTH, 'Destination name'),
  startDate: isoDateSchema,
  endDate: isoDateSchema,
});
export type DestinationInput = z.infer<typeof destinationInputSchema>;

/**
 * 1–10 Destinations (BR-5), sorted by start date, forming a valid sequence (BR-6) of at most
 * 60 days (BR-7). Issue paths refer to indexes *after* sorting (api-contract §7.2).
 */
export const destinationsInputSchema = z
  .array(destinationInputSchema)
  .min(1, { message: 'Add at least one destination' })
  .max(MAX_DESTINATIONS, { message: `A trip can have at most ${MAX_DESTINATIONS} destinations` })
  .transform((list) => sortDestinations(list))
  .superRefine((sorted, ctx) => {
    for (const issue of validateDestinationSequence(sorted)) {
      ctx.addIssue({ code: 'custom', path: issue.path, message: issue.message });
    }
  });

export const tripInputSchema = z.strictObject({
  name: trimmedString(MAX_NAME_LENGTH, 'Trip name'),
  tripType: tripTypeSchema,
  destinations: destinationsInputSchema,
});
export type TripInput = z.input<typeof tripInputSchema>;
export type TripInputParsed = z.output<typeof tripInputSchema>;

export const tripUpdateInputSchema = tripInputSchema.extend({
  confirmDeleteActivities: z.boolean().optional(),
});
export type TripUpdateInput = z.input<typeof tripUpdateInputSchema>;
export type TripUpdateInputParsed = z.output<typeof tripUpdateInputSchema>;

export const destinationSchema = z.object({
  name: z.string(),
  startDate: isoDateSchema,
  endDate: isoDateSchema,
});
export type Destination = z.infer<typeof destinationSchema>;

export const tripSummarySchema = z.object({
  id: idSchema,
  name: z.string(),
  tripType: tripTypeSchema,
  startDate: isoDateSchema,
  endDate: isoDateSchema,
  dayCount: z.int(),
  destinations: z.array(destinationSchema),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});
export type TripSummary = z.infer<typeof tripSummarySchema>;

export const tripDetailSchema = tripSummarySchema.extend({
  activities: z.array(activitySchema),
});
export type TripDetail = z.infer<typeof tripDetailSchema>;

/** Path param. Not validated as a UUID: a malformed id is a 404, like an unknown one (api-contract §3). */
export const tripParamsSchema = z.object({ tripId: z.string() });
