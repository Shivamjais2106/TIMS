import type { Request, Response } from 'express';
import { validated } from '../middleware/validate.middleware';
import * as industryService from '../services/industry.service';
import { asyncHandler } from '../utils/asyncHandler';
import { buildPaginationMeta, sendSuccess } from '../utils/response';
import type { IdParam } from '../validators/common.schema';
import type {
  CreateIndustryInput,
  ListIndustriesQuery,
  UpdateIndustryInput,
} from '../validators/industry.schema';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const query = validated<ListIndustriesQuery>(req, 'query');
  const { items, total } = await industryService.listIndustries(query);
  sendSuccess(res, items, 200, { ...buildPaginationMeta(query.page, query.pageSize, total) });
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = validated<IdParam>(req, 'params');
  const facility = await industryService.getIndustryById(id);
  sendSuccess(res, facility);
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const input = validated<CreateIndustryInput>(req, 'body');
  const facility = await industryService.createIndustry(input);
  sendSuccess(res, facility, 201);
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const { id } = validated<IdParam>(req, 'params');
  const input = validated<UpdateIndustryInput>(req, 'body');
  const facility = await industryService.updateIndustry(id, input);
  sendSuccess(res, facility);
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const { id } = validated<IdParam>(req, 'params');
  await industryService.deleteIndustry(id);
  res.status(204).send();
});

export const summary = asyncHandler(async (_req: Request, res: Response) => {
  const data = await industryService.getFacilitySummary(6);
  sendSuccess(res, data);
});
