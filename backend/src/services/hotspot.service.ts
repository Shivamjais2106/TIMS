import { getPostgisStatus } from '../config/postgis';
import { prisma } from '../config/prisma';
import { Prisma } from '../generated/prisma/client';
import { ApiError } from '../utils/ApiError';
import { createLogger } from '../utils/logger';
import { assessHotspot, PERSISTENT_SOURCE_DAYS, toRiskLevel } from '../utils/risk';
import type { CreateHotspotInput, ListHotspotsQuery, UpdateHotspotInput } from '../validators/hotspot.schema';
import { bboxWhere, findNearestFacility, type NearbyFacility } from './geo.service';

const log = createLogger('hotspots');

/** Facility fields embedded in hotspot responses. */
const facilitySelect = {
  id: true,
  name: true,
  type: true,
  location: true,
  latitude: true,
  longitude: true,
  riskLevel: true,
} as const;

const hotspotInclude = {
  industrialFacility: { select: facilitySelect },
} satisfies Prisma.HotspotInclude;

export type HotspotWithFacility = Prisma.HotspotGetPayload<{ include: typeof hotspotInclude }>;

function buildWhere(query: ListHotspotsQuery): Prisma.HotspotWhereInput {
  const where: Prisma.HotspotWhereInput = {};

  if (query.eventType?.length) where.eventType = { in: query.eventType };
  if (query.riskLevel?.length) where.riskLevel = { in: query.riskLevel };
  if (query.source?.length) where.source = { in: query.source };
  if (query.minConfidence !== undefined) where.confidence = { gte: query.minConfidence };
  if (query.minRiskScore !== undefined) where.riskScore = { gte: query.minRiskScore };
  if (query.industrialFacilityId) where.industrialFacilityId = query.industrialFacilityId;

  const minPersistence = query.persistentOnly
    ? Math.max(query.minPersistenceDays ?? 0, PERSISTENT_SOURCE_DAYS)
    : query.minPersistenceDays;
  if (minPersistence !== undefined) where.persistenceDays = { gte: minPersistence };

  if (query.from || query.to) {
    where.detectedAt = {
      ...(query.from ? { gte: query.from } : {}),
      ...(query.to ? { lte: query.to } : {}),
    };
  }

  if (query.bbox) Object.assign(where, bboxWhere(query.bbox));

  if (query.search) {
    where.OR = [
      { id: { contains: query.search, mode: 'insensitive' } },
      { region: { contains: query.search, mode: 'insensitive' } },
      { satellite: { contains: query.search, mode: 'insensitive' } },
      { industrialFacility: { name: { contains: query.search, mode: 'insensitive' } } },
      { industrialFacility: { location: { contains: query.search, mode: 'insensitive' } } },
    ];
  }

  return where;
}

export async function listHotspots(query: ListHotspotsQuery): Promise<{
  items: HotspotWithFacility[];
  total: number;
}> {
  const where = buildWhere(query);

  const [items, total] = await Promise.all([
    prisma.hotspot.findMany({
      where,
      include: hotspotInclude,
      orderBy: { [query.sortBy]: query.sortOrder },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.hotspot.count({ where }),
  ]);

  return { items, total };
}

export async function getHotspotById(id: string): Promise<HotspotWithFacility> {
  const hotspot = await prisma.hotspot.findUnique({ where: { id }, include: hotspotInclude });
  if (!hotspot) throw ApiError.notFound(`Hotspot ${id} not found`);
  return hotspot;
}

/**
 * Resolves the nearest industrial facility for a coordinate.
 *
 * Returns `null` (rather than throwing) when PostGIS is unavailable, so plain
 * CRUD keeps working on a non-spatial database — the facility link is simply
 * left unset and can be backfilled once PostGIS is enabled.
 */
export async function resolveNearestFacility(
  latitude: number,
  longitude: number,
): Promise<NearbyFacility | null> {
  if (!getPostgisStatus().available) return null;
  try {
    return await findNearestFacility(latitude, longitude, 50);
  } catch (error) {
    log.warn('Nearest-facility lookup failed', { error: error instanceof Error ? error.message : error });
    return null;
  }
}

export async function createHotspot(input: CreateHotspotInput): Promise<HotspotWithFacility> {
  // An explicit facility id wins; otherwise let PostGIS find the closest one.
  let facilityId = input.industrialFacilityId ?? null;
  let distanceToFacilityM: number | null = null;

  if (facilityId) {
    const facility = await prisma.industrialFacility.findUnique({
      where: { id: facilityId },
      select: { latitude: true, longitude: true },
    });
    if (!facility) throw ApiError.badRequest(`Industrial facility ${facilityId} does not exist`);
  } else {
    const nearest = await resolveNearestFacility(input.latitude, input.longitude);
    if (nearest) {
      facilityId = nearest.id;
      distanceToFacilityM = nearest.distanceMeters;
    }
  }

  const assessment = assessHotspot({
    brightnessTemperature: input.brightnessTemperature,
    frp: input.frp ?? null,
    confidence: input.confidence,
    persistenceDays: input.persistenceDays,
    distanceToFacilityM,
    dayNight: input.dayNight ?? null,
  });

  const eventType = input.eventType ?? assessment.eventType;
  const riskScore = input.riskScore ?? assessment.riskScore;

  return prisma.hotspot.create({
    data: {
      latitude: input.latitude,
      longitude: input.longitude,
      detectedAt: input.detectedAt,
      confidence: input.confidence,
      brightnessTemperature: input.brightnessTemperature,
      frp: input.frp ?? null,
      persistenceDays: input.persistenceDays,
      satellite: input.satellite ?? null,
      dayNight: input.dayNight ?? null,
      region: input.region ?? null,
      source: input.source,
      externalId: input.externalId ?? null,
      eventType,
      riskScore,
      riskLevel: toRiskLevel(riskScore),
      industrialFacilityId: facilityId,
      distanceToFacilityM,
    },
    include: hotspotInclude,
  });
}

export async function updateHotspot(id: string, input: UpdateHotspotInput): Promise<HotspotWithFacility> {
  const existing = await prisma.hotspot.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound(`Hotspot ${id} not found`);

  const latitude = input.latitude ?? existing.latitude;
  const longitude = input.longitude ?? existing.longitude;
  const movedOrRelinked =
    (input.latitude !== undefined && input.latitude !== existing.latitude) ||
    (input.longitude !== undefined && input.longitude !== existing.longitude) ||
    input.industrialFacilityId !== undefined;

  let facilityId = input.industrialFacilityId ?? existing.industrialFacilityId;
  let distanceToFacilityM = existing.distanceToFacilityM;

  if (movedOrRelinked) {
    if (input.industrialFacilityId) {
      const facility = await prisma.industrialFacility.findUnique({
        where: { id: input.industrialFacilityId },
        select: { latitude: true, longitude: true },
      });
      if (!facility) throw ApiError.badRequest(`Industrial facility ${input.industrialFacilityId} does not exist`);
      facilityId = input.industrialFacilityId;
      distanceToFacilityM = null;
    } else {
      const nearest = await resolveNearestFacility(latitude, longitude);
      facilityId = nearest?.id ?? null;
      distanceToFacilityM = nearest?.distanceMeters ?? null;
    }
  }

  const persistenceDays = input.persistenceDays ?? existing.persistenceDays;
  const confidence = input.confidence ?? existing.confidence;
  const brightnessTemperature = input.brightnessTemperature ?? existing.brightnessTemperature;
  const frp = input.frp ?? existing.frp;
  const dayNight = input.dayNight ?? existing.dayNight;

  const assessment = assessHotspot({
    brightnessTemperature,
    frp,
    confidence,
    persistenceDays,
    distanceToFacilityM,
    dayNight,
  });

  const eventType = input.eventType ?? assessment.eventType;
  const riskScore = input.riskScore ?? assessment.riskScore;

  return prisma.hotspot.update({
    where: { id },
    data: {
      latitude,
      longitude,
      detectedAt: input.detectedAt ?? existing.detectedAt,
      confidence,
      brightnessTemperature,
      frp,
      persistenceDays,
      satellite: input.satellite ?? existing.satellite,
      dayNight,
      region: input.region ?? existing.region,
      source: input.source ?? existing.source,
      eventType,
      riskScore,
      riskLevel: toRiskLevel(riskScore),
      industrialFacilityId: facilityId,
      distanceToFacilityM,
    },
    include: hotspotInclude,
  });
}

export async function deleteHotspot(id: string): Promise<void> {
  const existing = await prisma.hotspot.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw ApiError.notFound(`Hotspot ${id} not found`);
  await prisma.hotspot.delete({ where: { id } });
}

/** Latest detections, used by the dashboard "Recent thermal events" panel. */
export async function getRecentHotspots(limit = 8): Promise<HotspotWithFacility[]> {
  return prisma.hotspot.findMany({
    include: hotspotInclude,
    orderBy: { detectedAt: 'desc' },
    take: limit,
  });
}
