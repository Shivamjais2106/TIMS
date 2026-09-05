import type { Request, Response } from 'express';
import { validated } from '../middleware/validate.middleware';
import * as authService from '../services/auth.service';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/response';
import type { LoginInput, SignupInput } from '../validators/auth.schema';

export const signup = asyncHandler(async (req: Request, res: Response) => {
  const input = validated<SignupInput>(req, 'body');
  const result = await authService.signup(input);
  sendSuccess(res, result, 201);
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const input = validated<LoginInput>(req, 'body');
  const result = await authService.login(input);
  sendSuccess(res, result);
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const user = await authService.getProfile(req.user.id);
  sendSuccess(res, { user });
});

/**
 * Stateless JWTs cannot be revoked server-side without a denylist, so logout is
 * a client-side token discard. The endpoint exists so the frontend has one
 * place to call and so a denylist can be added later without an API change.
 */
export const logout = asyncHandler(async (_req: Request, res: Response) => {
  sendSuccess(res, { message: 'Signed out' });
});
