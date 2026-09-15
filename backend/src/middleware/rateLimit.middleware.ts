import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

const disabled = env.isTest;

/**
 * Local development is far more request-dense than production: hot reload
 * re-fetches on every save, React strict mode double-mounts every effect, and
 * a dozen dashboard panels each hit their own endpoint on load. The production
 * ceiling of 600 per 15 minutes is reached in minutes of ordinary work, and
 * the resulting 429s look exactly like a broken backend.
 *
 * Production keeps the strict limits; only development is relaxed.
 */
const API_LIMIT = env.isProduction ? 600 : 20_000;
const AUTH_LIMIT = env.isProduction ? 20 : 500;

/** Broad limiter applied to the whole API surface. */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: API_LIMIT,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => disabled,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests, please slow down' } },
});

/** Tight limiter for credential endpoints to blunt brute-force attempts. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: AUTH_LIMIT,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip: () => disabled,
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many authentication attempts. Try again in 15 minutes.' },
  },
});
