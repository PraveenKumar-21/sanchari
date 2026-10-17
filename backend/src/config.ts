import { z } from 'zod';

const booleanish = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  APP_ORIGIN: z.url().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(14),
  TRUST_PROXY: booleanish.optional(),
  CRON_SECRET: z.string().min(32).optional(),
  // Provided by Vercel at runtime.
  VERCEL: z.string().optional(),
  VERCEL_ENV: z.enum(['production', 'preview', 'development']).optional(),
  VERCEL_URL: z.string().optional(),
  VERCEL_BRANCH_URL: z.string().optional(),
  VERCEL_PROJECT_PRODUCTION_URL: z.string().optional(),
});

type Env = z.infer<typeof envSchema>;

export type Config = Env & {
  trustProxy: boolean;
  /** Origins accepted by the Origin check on state-changing requests (backend-spec §7). */
  allowedOrigins: string[];
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(parsed.error)}`);
  }
  const e = parsed.data;

  const allowedOrigins = new Set<string>();
  if (e.APP_ORIGIN) allowedOrigins.add(e.APP_ORIGIN);
  // On Vercel, also accept this deployment's own URLs (deployment, branch, and production domain).
  for (const host of [e.VERCEL_URL, e.VERCEL_BRANCH_URL, e.VERCEL_PROJECT_PRODUCTION_URL]) {
    if (host) allowedOrigins.add(`https://${host}`);
  }

  return {
    ...e,
    trustProxy: e.TRUST_PROXY ?? Boolean(e.VERCEL),
    allowedOrigins: [...allowedOrigins],
  };
}
