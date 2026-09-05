import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Wraps an async controller so rejected promises reach the Express error
 * handler instead of becoming unhandled rejections.
 */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    void handler(req, res, next).catch(next);
  };
}
