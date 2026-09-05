import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

const disabled = env.isTest;

/** Broad limiter applied to the whole API surface. */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => disabled,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests, please slow down' } },
});

/** Tight limiter for credential endpoints to blunt brute-force attempts. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip: () => disabled,
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many authentication attempts. Try again in 15 minutes.' },
  },
});
