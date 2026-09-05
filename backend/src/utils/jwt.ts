import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import type { Role } from '../generated/prisma/enums';
import { ApiError } from './ApiError';

export interface AccessTokenPayload extends JwtPayload {
  sub: string;
  email: string;
  role: Role;
}

export function signAccessToken(payload: { userId: string; email: string; role: Role }): string {
  const options: SignOptions = {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
    issuer: 'tims-api',
  };

  return jwt.sign({ sub: payload.userId, email: payload.email, role: payload.role }, env.JWT_SECRET, options);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, { issuer: 'tims-api' });
    if (typeof decoded === 'string') throw new Error('Unexpected token payload');
    return decoded as AccessTokenPayload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw ApiError.unauthorized('Session expired, please sign in again');
    }
    throw ApiError.unauthorized('Invalid authentication token');
  }
}

/** Extracts the bearer token from an `Authorization` header, if present. */
export function extractBearerToken(headerValue: string | undefined): string | null {
  if (!headerValue) return null;
  const [scheme, token] = headerValue.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim() || null;
}
