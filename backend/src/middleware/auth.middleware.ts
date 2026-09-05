import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../config/prisma';
import type { Role } from '../generated/prisma/enums';
import { ApiError } from '../utils/ApiError';
import { extractBearerToken, verifyAccessToken } from '../utils/jwt';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

/**
 * Verifies the bearer token and re-reads the user from the database, so a
 * deleted or role-changed account cannot keep acting on a still-valid token.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = extractBearerToken(req.headers.authorization);
    if (!token) throw ApiError.unauthorized('Missing authentication token');

    const payload = verifyAccessToken(token);

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, name: true, role: true },
    });

    if (!user) throw ApiError.unauthorized('Account no longer exists');

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

/** Role gate. Use after `requireAuth`. */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(ApiError.unauthorized());
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(ApiError.forbidden(`Requires one of the following roles: ${roles.join(', ')}`));
      return;
    }
    next();
  };
}

/** Attaches `req.user` when a valid token is present, but never rejects. */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) {
    next();
    return;
  }
  try {
    const payload = verifyAccessToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, name: true, role: true },
    });
    if (user) req.user = user;
  } catch {
    // Ignored on purpose: this middleware is best-effort.
  }
  next();
}
