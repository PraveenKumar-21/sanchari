import { z } from 'zod';
import { MAX_ACTIVITIES_PER_DATE, MAX_ACTIVITY_LENGTH } from '../constants';
import { idSchema, isoDateSchema, timestampSchema, trimmedString } from './common';

// BR-9: trimmed, 1–500 characters, single line.
export const activityTextSchema = trimmedString(MAX_ACTIVITY_LENGTH, 'Activity').refine(
  (text) => !/[\r\n]/.test(text),
  { message: 'Activity must be a single line' },
);

export const activitySchema = z.object({
  id: idSchema,
  date: isoDateSchema,
  position: z.int(),
  text: z.string(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});
export type Activity = z.infer<typeof activitySchema>;

export const activityCreateInputSchema = z.strictObject({
  date: isoDateSchema,
  text: activityTextSchema,
  position: z.int().min(0).optional(),
});
export type ActivityCreateInput = z.input<typeof activityCreateInputSchema>;

export const activityPatchInputSchema = z.strictObject({
  text: activityTextSchema,
});
export type ActivityPatchInput = z.input<typeof activityPatchInputSchema>;

export const activityOrderInputSchema = z.strictObject({
  activityIds: z
    .array(idSchema)
    .min(1)
    .max(MAX_ACTIVITIES_PER_DATE)
    .refine((ids) => new Set(ids).size === ids.length, { message: 'Activity ids must be unique' }),
});
export type ActivityOrderInput = z.input<typeof activityOrderInputSchema>;

export const activityParamsSchema = z.object({ tripId: z.string(), activityId: z.string() });
export const dayParamsSchema = z.object({ tripId: z.string(), date: isoDateSchema });
