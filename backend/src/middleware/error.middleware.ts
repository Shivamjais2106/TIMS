import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { env } from '../config/env';
import { Prisma } from '../generated/prisma/client';
import { ApiError } from '../utils/ApiError';
import { createLogger } from '../utils/logger';

const log = createLogger('error');

/** 404 handler for unmatched routes. Registered after all route mounts. */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} does not exist`));
}

interface ErrorBody {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
    stack?: string;
  };
}

function normalise(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (error instanceof ZodError) {
    return ApiError.unprocessable(
      'Request validation failed',
      error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })),
    );
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002': {
        const target = (error.meta?.['target'] as string[] | undefined)?.join(', ') ?? 'field';
        return ApiError.conflict(`A record with this ${target} already exists`);
      }
      case 'P2025':
        return ApiError.notFound('The requested record was not found');
      case 'P2003':
        return ApiError.badRequest('Related record does not exist');
      default:
        return new ApiError(400, 'Database request failed', `PRISMA_${error.code}`);
    }
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    return ApiError.badRequest('Malformed database query');
  }

  if (error instanceof Prisma.PrismaClientInitializationError) {
    return ApiError.serviceUnavailable(
      'Cannot reach the database. Check DATABASE_URL and that PostgreSQL is running.',
    );
  }

  const message = error instanceof Error ? error.message : 'Unexpected server error';
  const wrapped = new ApiError(500, message, 'INTERNAL_ERROR');
  if (error instanceof Error) wrapped.stack = error.stack;
  return wrapped;
}

/**
 * Centralised error handler. Client-safe messages only: 5xx details are logged
 * server-side and replaced with a generic message in production.
 */
export function errorHandler(error: unknown, req: Request, res: Response, _next: NextFunction): void {
  const apiError = normalise(error);

  if (apiError.statusCode >= 500) {
    log.error(`${req.method} ${req.originalUrl} -> ${apiError.statusCode}`, {
      message: apiError.message,
      stack: apiError.stack,
    });
  } else {
    log.debug(`${req.method} ${req.originalUrl} -> ${apiError.statusCode} ${apiError.message}`);
  }

  const exposeMessage = apiError.statusCode < 500 || !env.isProduction;

  const body: ErrorBody = {
    success: false,
    error: {
      code: apiError.code,
      message: exposeMessage ? apiError.message : 'Internal server error',
    },
  };

  if (apiError.details !== undefined) body.error.details = apiError.details;
  if (!env.isProduction && apiError.statusCode >= 500) body.error.stack = apiError.stack;

  res.status(apiError.statusCode).json(body);
}
