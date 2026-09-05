import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodType } from 'zod';
import { ApiError } from '../utils/ApiError';

export interface RequestSchemas {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

interface ValidatedRequest extends Request {
  validated: {
    body: unknown;
    query: unknown;
    params: unknown;
  };
}

/** Reads the parsed output of a `validate()` middleware in a typed way. */
export function validated<T>(req: Request, part: 'body' | 'query' | 'params'): T {
  return (req as ValidatedRequest).validated?.[part] as T;
}

function formatIssues(error: ZodError): Array<{ field: string; message: string }> {
  return error.issues.map((issue) => ({
    field: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
}

/**
 * Validates body/query/params against Zod schemas.
 *
 * Express 5 exposes `req.query` as a getter-only property, so parsed values are
 * written to `req.validated` instead of mutating the request in place.
 */
export function validate(schemas: RequestSchemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const target = req as ValidatedRequest;
    target.validated = { body: req.body, query: req.query, params: req.params };

    try {
      if (schemas.params) target.validated.params = schemas.params.parse(req.params);
      if (schemas.query) target.validated.query = schemas.query.parse(req.query);
      if (schemas.body) target.validated.body = schemas.body.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        next(ApiError.unprocessable('Request validation failed', formatIssues(error)));
        return;
      }
      next(error);
    }
  };
}
