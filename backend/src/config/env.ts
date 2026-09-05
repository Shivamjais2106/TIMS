import 'dotenv/config';
import { z } from 'zod';

/**
 * Every environment variable the backend reads is declared (and validated)
 * here. The process refuses to boot with an invalid configuration rather than
 * failing later at an arbitrary request.
 */
const booleanish = z
  .union([z.boolean(), z.string()])
  .transform((value) => (typeof value === 'boolean' ? value : ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),

  /** Comma separated list of allowed browser origins. */
  FRONTEND_URL: z.string().default('http://localhost:3000'),

  FIRMS_MAP_KEY: z.string().default(''),
  FIRMS_BASE_URL: z.string().url().default('https://firms.modaps.eosdis.nasa.gov/api'),
  FIRMS_SOURCE: z.string().default('VIIRS_SNPP_NRT'),
  FIRMS_AREA: z.string().default('68.0,6.0,98.0,38.0'),
  FIRMS_DAY_RANGE: z.coerce.number().int().min(1).max(10).default(1),

  OSM_OVERPASS_URL: z.string().url().default('https://overpass-api.de/api/interpreter'),
  OSM_ENABLED: booleanish.default(false),

  ENABLE_CRON_JOBS: booleanish.default(false),
  FIRMS_CRON_SCHEDULE: z.string().default('*/30 * * * *'),
  OSM_CRON_SCHEDULE: z.string().default('0 3 * * 0'),
  ANALYTICS_CRON_SCHEDULE: z.string().default('15 * * * *'),

  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(8).max(15).default(12),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((issue) => `  • ${issue.path.join('.')}: ${issue.message}`).join('\n');
  // eslint-disable-next-line no-console
  console.error(`\n[TIMS] Invalid environment configuration:\n${issues}\n\nCopy .env.example to .env and fill in the values.\n`);
  process.exit(1);
}

const raw = parsed.data;

export const env = {
  ...raw,
  isProduction: raw.NODE_ENV === 'production',
  isDevelopment: raw.NODE_ENV === 'development',
  isTest: raw.NODE_ENV === 'test',
  /** Origins allowed by CORS, parsed from the comma separated FRONTEND_URL. */
  allowedOrigins: raw.FRONTEND_URL.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  /** True when a NASA FIRMS MAP_KEY is present — gates the live provider. */
  firmsEnabled: raw.FIRMS_MAP_KEY.trim().length > 0,
} as const;

export type Env = typeof env;
