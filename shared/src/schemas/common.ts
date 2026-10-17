import { z } from 'zod';
import { ERROR_CODES } from '../constants';
import { isValidDate } from '../dates';

/** 'YYYY-MM-DD', a real calendar date (api-contract §3). */
export const isoDateSchema = z
  .string()
  .min(1, { message: 'Date is required' })
  .refine((v) => v === '' || isValidDate(v), { message: 'Must be a valid date (YYYY-MM-DD)' });

/** ISO 8601 UTC timestamp in responses (createdAt / updatedAt). */
export const timestampSchema = z.string();

export const idSchema = z.uuid();

/** A trimmed, required string of at most `max` characters. */
export const trimmedString = (max: number, label = 'This field') =>
  z
    .string()
    .trim()
    .min(1, { message: `${label} is required` })
    .max(max, { message: `${label} must be at most ${max} characters` });

export const dataEnvelope = <T extends z.ZodType>(schema: T) => z.object({ data: schema });

export const errorCodeSchema = z.enum(ERROR_CODES);

export const errorResponseSchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string(),
    details: z.array(z.unknown()),
  }),
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;

export const validationIssueSchema = z.object({ path: z.string(), message: z.string() });
export type ValidationIssue = z.infer<typeof validationIssueSchema>;

export const activitiesWouldBeDeletedDetailSchema = z.object({
  date: isoDateSchema,
  count: z.int(),
});
export type ActivitiesWouldBeDeletedDetail = z.infer<typeof activitiesWouldBeDeletedDetailSchema>;

export const limitReachedDetailSchema = z.object({
  limit: z.enum(['tripsPerUser', 'activitiesPerDate']),
  max: z.int(),
});
export type LimitReachedDetail = z.infer<typeof limitReachedDetailSchema>;
