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
  /**
   * Area of interest as "minLng,minLat,maxLng,maxLat".
   *
   * Left blank in normal operation: the ingest falls back to BHOPAL_BBOX_PARAM
   * from the generated Bhopal config, which is the single source of truth for
   * pilot geography. Set this only to temporarily override the pilot area.
   */
  FIRMS_AREA: z.string().default(''),
  /**
   * FIRMS enforces 1..5 and answers HTTP 400 "Invalid day range. Expects
   * [1..5]" for anything larger — verified against the live API on 2026-09-15.
   * The previous max of 10 meant a misconfigured deployment failed every fetch.
   */
  FIRMS_DAY_RANGE: z.coerce.number().int().min(1).max(5).default(5),
  /**
   * When a live NRT fetch yields fewer than this many records, the ingest also
   * queries the FIRMS archive over a documented historical window and logs
   * which range it actually used. It never substitutes synthetic data.
   */
  FIRMS_MIN_LIVE_RECORDS: z.coerce.number().int().min(0).default(1),
  FIRMS_ARCHIVE_FALLBACK: booleanish.default(true),

  OSM_OVERPASS_URL: z.string().url().default('https://overpass-api.de/api/interpreter'),
  OSM_ENABLED: booleanish.default(true),
  /** Overpass asks every client to identify itself; anonymous calls get HTTP 406. */
  OSM_USER_AGENT: z.string().default('TIMS-SIH26162/1.0 (thermal monitoring research)'),

  // --- ML classification service -------------------------------------------
  ML_SERVICE_URL: z.string().url().default('http://localhost:8000'),
  ML_SERVICE_ENABLED: booleanish.default(true),
  ML_SERVICE_TIMEOUT_MS: z.coerce.number().int().min(100).default(5_000),

  // --- Weather context (IMD, with an open fallback) -------------------------
  /** IMD does not publish a documented public API; see weather provider docs. */
  IMD_API_KEY: z.string().default(''),
  IMD_BASE_URL: z.string().default(''),
  /** Open-Meteo needs no key and is used as an explicitly-labelled fallback. */
  WEATHER_FALLBACK_ENABLED: booleanish.default(true),

  // --- ISRO / NRSC Bhuvan --------------------------------------------------
  /** Bhuvan services require registration and often IP whitelisting. */
  BHUVAN_API_KEY: z.string().default(''),
  BHUVAN_BASE_URL: z.string().default(''),

  /**
   * Explicit opt-in only. Never an automatic fallback: when DEMO_MODE is off
   * and a provider fails, the API reports the failure rather than inventing
   * records. The UI shows a persistent "DEMO DATA" banner when it is on.
   */
  DEMO_MODE: booleanish.default(false),

  ENABLE_CRON_JOBS: booleanish.default(false),
  FIRMS_CRON_SCHEDULE: z.string().default('*/30 * * * *'),
  OSM_CRON_SCHEDULE: z.string().default('0 3 * * 0'),
  ANALYTICS_CRON_SCHEDULE: z.string().default('15 * * * *'),
  WEATHER_CRON_SCHEDULE: z.string().default('*/30 * * * *'),
  RISK_CRON_SCHEDULE: z.string().default('10,40 * * * *'),

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
  /** True when IMD credentials are configured. Weather degrades honestly without them. */
  imdEnabled: raw.IMD_API_KEY.trim().length > 0 && raw.IMD_BASE_URL.trim().length > 0,
  /** True when Bhuvan credentials are configured. */
  bhuvanEnabled: raw.BHUVAN_API_KEY.trim().length > 0 && raw.BHUVAN_BASE_URL.trim().length > 0,
} as const;

export type Env = typeof env;
