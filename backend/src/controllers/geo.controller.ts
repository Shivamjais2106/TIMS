import type { Request, Response } from 'express';
import { detectPostgis, getPostgisStatus } from '../config/postgis';
import { validated } from '../middleware/validate.middleware';
import * as geoService from '../services/geo.service';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/response';
import type {
  AreaQuery,
  HotspotRadiusQuery,
  NearestFacilityQuery,
  RadiusQuery,
} from '../validators/geo.schema';

/**
 * Reports whether PostGIS is available.
 *
 * The frontend uses this to disable spatial controls up-front instead of
 * letting the user trigger a 503.
 */
export const status = asyncHandler(async (req: Request, res: Response) => {
  const refresh = req.query['refresh'] === 'true';
  sendSuccess(res, refresh ? await detectPostgis() : getPostgisStatus());
});

export const facilitiesNear = asyncHandler(async (req: Request, res: Response) => {
  const { lat, lng, radiusKm, limit } = validated<RadiusQuery>(req, 'query');
  const facilities = await geoService.findFacilitiesNearPoint(lat, lng, radiusKm, limit);
  sendSuccess(res, facilities, 200, { center: { lat, lng }, radiusKm, count: facilities.length });
});

export const hotspotsNear = asyncHandler(async (req: Request, res: Response) => {
  const { lat, lng, radiusKm, limit, eventType, riskLevel } = validated<HotspotRadiusQuery>(req, 'query');
  let hotspots = await geoService.findHotspotsNearPoint(lat, lng, radiusKm, limit);

  // Filtering after the spatial query keeps the SQL simple while still letting
  // the GiST index do the expensive part.
  if (eventType) hotspots = hotspots.filter((hotspot) => hotspot.eventType === eventType);
  if (riskLevel) hotspots = hotspots.filter((hotspot) => hotspot.riskLevel === riskLevel);

  sendSuccess(res, hotspots, 200, { center: { lat, lng }, radiusKm, count: hotspots.length });
});

export const nearestFacility = asyncHandler(async (req: Request, res: Response) => {
  const { lat, lng, maxDistanceKm } = validated<NearestFacilityQuery>(req, 'query');
  const facility = await geoService.findNearestFacility(lat, lng, maxDistanceKm);
  sendSuccess(res, facility);
});

/** Point-in-area query for an arbitrary GeoJSON polygon drawn on the map. */
export const hotspotsInArea = asyncHandler(async (req: Request, res: Response) => {
  const { polygon, limit } = validated<AreaQuery>(req, 'body');
  const hotspots = await geoService.findHotspotsInPolygon(polygon, limit);
  sendSuccess(res, hotspots, 200, { count: hotspots.length });
});
