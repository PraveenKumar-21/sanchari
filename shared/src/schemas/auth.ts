import { z } from 'zod';
import { PASSWORD_MAX, PASSWORD_MIN, USERNAME_MAX, USERNAME_MIN } from '../constants';
import { idSchema, timestampSchema } from './common';

// BR-1: lowercased, 3–30 characters of a–z 0–9 _ . -
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(USERNAME_MIN, { message: `Username must be at least ${USERNAME_MIN} characters` })
  .max(USERNAME_MAX, { message: `Username must be at most ${USERNAME_MAX} characters` })
  .regex(/^[a-z0-9_.-]+$/, {
    message: 'Username can only contain letters, digits, underscores, dots and hyphens',
  });

// BR-2: 8–128 characters, not trimmed.
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, { message: `Password must be at least ${PASSWORD_MIN} characters` })
  .max(PASSWORD_MAX, { message: `Password must be at most ${PASSWORD_MAX} characters` });

export const signupInputSchema = z.strictObject({
  username: usernameSchema,
  password: passwordSchema,
});
export type SignupInput = z.infer<typeof signupInputSchema>;

// Login checks presence only; the signup rules are not applied (api-contract §7.1).
export const loginInputSchema = z.strictObject({
  username: z.string().trim().toLowerCase().min(1, { message: 'Username is required' }).max(200),
  password: z.string().min(1, { message: 'Password is required' }).max(1024),
});
export type LoginInput = z.infer<typeof loginInputSchema>;

export const userSchema = z.object({
  id: idSchema,
  username: z.string(),
  createdAt: timestampSchema,
});
export type User = z.infer<typeof userSchema>;
