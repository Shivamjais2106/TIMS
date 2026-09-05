import type { Request, Response } from 'express';
import { validated } from '../middleware/validate.middleware';
import { findFacilitiesNearPoint } from '../services/geo.service';
import * as hotspotService from '../services/hotspot.service';
import { asyncHandler } from '../utils/asyncHandler';
import { buildPaginationMeta, sendSuccess } from '../utils/response';
import type { IdParam } from '../validators/common.schema';
import type {
  CreateHotspotInput,
  ListHotspotsQuery,
  UpdateHotspotInput,
} from '../validators/hotspot.schema';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const query = validated<ListHotspotsQuery>(req, 'query');
  const { items, total } = await hotspotService.listHotspots(query);
  sendSuccess(res, items, 200, { ...buildPaginationMeta(query.page, query.pageSize, total) });
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = validated<IdParam>(req, 'params');
  const hotspot = await hotspotService.getHotspotById(id);
  sendSuccess(res, hotspot);
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const input = validated<CreateHotspotInput>(req, 'body');
  const hotspot = await hotspotService.createHotspot(input);
  sendSuccess(res, hotspot, 201);
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const { id } = validated<IdParam>(req, 'params');
  const input = validated<UpdateHotspotInput>(req, 'body');
  const hotspot = await hotspotService.updateHotspot(id, input);
  sendSuccess(res, hotspot);
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const { id } = validated<IdParam>(req, 'params');
  await hotspotService.deleteHotspot(id);
  res.status(204).send();
});

export const recent = asyncHandler(async (_req: Request, res: Response) => {
  const hotspots = await hotspotService.getRecentHotspots(8);
  sendSuccess(res, hotspots);
});

/** Industrial facilities within a radius of a specific hotspot (PostGIS). */
export const nearbyFacilities = asyncHandler(async (req: Request, res: Response) => {
  const { id } = validated<IdParam>(req, 'params');
  const radiusKm = Number(req.query['radiusKm'] ?? 10);

  const hotspot = await hotspotService.getHotspotById(id);
  const facilities = await findFacilitiesNearPoint(hotspot.latitude, hotspot.longitude, radiusKm, 25);

  sendSuccess(res, facilities, 200, { hotspotId: id, radiusKm });
});
