import type { Request, Response } from 'express';
import { validated } from '../middleware/validate.middleware';
import * as analyticsService from '../services/analytics.service';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/response';
import type { CategoriesQuery, SummaryQuery, TrendsQuery } from '../validators/analytics.schema';

export const summary = asyncHandler(async (req: Request, res: Response) => {
  const query = validated<SummaryQuery>(req, 'query');
  sendSuccess(res, await analyticsService.getSummary(query));
});

export const trends = asyncHandler(async (req: Request, res: Response) => {
  const query = validated<TrendsQuery>(req, 'query');
  const data = await analyticsService.getTrends(query);
  sendSuccess(res, data, 200, { days: query.days, interval: query.interval });
});

export const categories = asyncHandler(async (req: Request, res: Response) => {
  const query = validated<CategoriesQuery>(req, 'query');
  sendSuccess(res, await analyticsService.getCategories(query));
});
