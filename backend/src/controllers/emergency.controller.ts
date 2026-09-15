import type { Request, Response } from 'express';
import { THRESHOLDS } from '../config/bhopal';
import { prisma } from '../config/prisma';
import { Prisma } from '../generated/prisma/client';
import type { EmergencyFacilityType } from '../generated/prisma/enums';
import {
  findEmergencyFacilitiesNear,
  findNearestEmergencyFacility,
} from '../services/emergency.service';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { buildPaginationMeta, sendSuccess } from '../utils/response';

/** Emergency response resources and exposed receptors. */

/**
 * Declared with `satisfies` rather than inline, matching the convention in
 * hotspot.service.ts: this generator only narrows relation fields when the
 * include object is typed against Prisma.HotspotInclude.
 */
const responseInclude = {
  industrialFacility: true,
  riskAssessments: { orderBy: { assessedAt: 'desc' }, take: 1 },
} satisfies Prisma.HotspotInclude;

const DISPATCH_DISCLAIMER =
  'Decision support — not an official emergency alert or dispatch system. ' +
  'Distances are straight-line and ignore the road network.';

/** Narrows Express's `string | string[] | undefined` to a trimmed string. */
function firstQueryString(value: unknown): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : undefined;
}

function parseType(value: unknown): EmergencyFacilityType | undefined {
  const text = firstQueryString(value);
  if (!text) return undefined;
  const allowed: EmergencyFacilityType[] = [
    'HOSPITAL',
    'FIRE_STATION',
    'SCHOOL',
    'POLICE',
    'SHELTER',
    'WATER_SOURCE',
  ];
  const upper = text.toUpperCase() as EmergencyFacilityType;
  if (!allowed.includes(upper)) {
    throw ApiError.badRequest(`type must be one of: ${allowed.join(', ')}`);
  }
  return upper;
}

/** GET /api/emergency — paginated register, optionally filtered by type. */
export const list = asyncHandler(async (req: Request, res: Response) => {
  const type = parseType(req.query['type']);
  const search = firstQueryString(req.query['search']) ?? '';
  const page = Math.max(1, Number(req.query['page'] ?? 1));
  const pageSize = Math.min(500, Math.max(1, Number(req.query['pageSize'] ?? 50)));

  const where = {
    ...(type ? { type } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { address: { contains: search, mode: 'insensitive' as const } },
            { operator: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.emergencyFacility.findMany({
      where,
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.emergencyFacility.count({ where }),
  ]);

  // Bare array in `data`, pagination in `meta` — the convention established by
  // hotspot/industry/alert.controller. The non-paginated endpoints below
  // deliberately return an object instead, because they carry a disclaimer
  // alongside their rows.
  sendSuccess(res, items, 200, { ...buildPaginationMeta(page, pageSize, total) });
});

/** GET /api/emergency/hospitals */
export const hospitals = asyncHandler(async (req: Request, res: Response) => {
  const items = await prisma.emergencyFacility.findMany({
    where: { type: 'HOSPITAL' },
    orderBy: { name: 'asc' },
    take: Math.min(1_000, Math.max(1, Number(req.query['limit'] ?? 500))),
  });
  sendSuccess(res, { items, total: items.length, disclaimer: DISPATCH_DISCLAIMER });
});

/** GET /api/emergency/fire-stations */
export const fireStations = asyncHandler(async (_req: Request, res: Response) => {
  const items = await prisma.emergencyFacility.findMany({
    where: { type: 'FIRE_STATION' },
    orderBy: { name: 'asc' },
  });

  sendSuccess(res, {
    items,
    total: items.length,
    disclaimer: DISPATCH_DISCLAIMER,
    coverageWarning:
      items.length < 5
        ? `Only ${items.length} fire station(s) are mapped in OpenStreetMap for this area. ` +
          'Bhopal operates more than this; OSM coverage of emergency services in Indian ' +
          'cities is incomplete, so nearest-station results are indicative only.'
        : null,
  });
});

/** GET /api/emergency/near?lat=&lon=&radiusKm=&type= */
export const near = asyncHandler(async (req: Request, res: Response) => {
  const latitude = Number(req.query['lat']);
  const longitude = Number(req.query['lon']);
  const radiusKm = Number(req.query['radiusKm'] ?? THRESHOLDS.impactZonesKm[0] ?? 1);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw ApiError.badRequest('lat and lon are required and must be numbers');
  }
  if (!Number.isFinite(radiusKm) || radiusKm <= 0 || radiusKm > 50) {
    throw ApiError.badRequest('radiusKm must be between 0 and 50');
  }

  const items = await findEmergencyFacilitiesNear(latitude, longitude, radiusKm, parseType(req.query['type']));
  sendSuccess(res, { items, total: items.length, radiusKm, disclaimer: DISPATCH_DISCLAIMER });
});

/**
 * GET /api/emergency/response/:hotspotId
 *
 * The emergency response panel payload for one incident: nearest hospital,
 * nearest fire station, nearby industry and exposed receptors.
 */
export const responsePlan = asyncHandler(async (req: Request, res: Response) => {
  const hotspotId = firstQueryString(req.params['hotspotId']);
  if (!hotspotId) throw ApiError.badRequest('hotspotId is required');

  const hotspot = await prisma.hotspot.findUnique({
    where: { id: hotspotId },
    include: responseInclude,
  });
  if (!hotspot) throw ApiError.notFound(`Hotspot ${hotspotId} not found`);

  const [nearestHospital, nearestFireStation, nearestSchool, withinFirstZone] = await Promise.all([
    findNearestEmergencyFacility(hotspot.latitude, hotspot.longitude, 'HOSPITAL'),
    findNearestEmergencyFacility(hotspot.latitude, hotspot.longitude, 'FIRE_STATION'),
    findNearestEmergencyFacility(hotspot.latitude, hotspot.longitude, 'SCHOOL'),
    findEmergencyFacilitiesNear(
      hotspot.latitude,
      hotspot.longitude,
      THRESHOLDS.impactZonesKm[0] ?? 1,
    ),
  ]);

  const assessment = hotspot.riskAssessments[0] ?? null;

  sendSuccess(res, {
    hotspot: {
      id: hotspot.id,
      latitude: hotspot.latitude,
      longitude: hotspot.longitude,
      detectedAt: hotspot.detectedAt,
      riskLevel: hotspot.riskLevel,
      riskScore: hotspot.riskScore,
      mlClass: hotspot.mlClass,
      mlConfidence: hotspot.mlConfidence,
      classificationPath: hotspot.classificationPath,
      persistenceDays: hotspot.persistenceDays,
      inBhopalBoundary: hotspot.inBhopalBoundary,
      firmsProduct: hotspot.firmsProduct,
    },
    nearestIndustrialFacility: hotspot.industrialFacility
      ? { ...hotspot.industrialFacility, distanceMeters: hotspot.distanceToFacilityM }
      : null,
    nearestHospital,
    nearestFireStation,
    nearestSchool,
    receptorsWithinFirstZone: withinFirstZone,
    riskAssessment: assessment
      ? {
          score: assessment.score,
          level: assessment.level,
          reasons: assessment.reasons,
          components: assessment.components,
          weights: assessment.weights,
          assessedAt: assessment.assessedAt,
        }
      : null,
    // Never invented. There is no licensed gridded-population layer for Bhopal
    // in this deployment, so the UI must render "Population estimate unavailable".
    populationEstimate: null,
    populationNote:
      'Population estimate unavailable — no licensed gridded population dataset is ' +
      'loaded for Bhopal. TIMS does not infer affected population counts.',
    routingNote:
      'No route is computed. A routing provider interface exists but is not wired to a ' +
      'live service, so only straight-line distances are shown.',
    disclaimer: DISPATCH_DISCLAIMER,
  });
});
