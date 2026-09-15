import { THRESHOLDS } from '../config/bhopal';
import { getPostgisStatus } from '../config/postgis';
import { prisma } from '../config/prisma';
import type { EmergencyFacilityType } from '../generated/prisma/enums';
import { ApiError } from '../utils/ApiError';

/**
 * Emergency response and impact analysis.
 *
 * Every distance here is computed by PostGIS on the WGS84 spheroid, never
 * approximated in JavaScript — a wrong distance to the nearest fire station is
 * worse than no distance at all.
 */

function assertPostgis(): void {
  const status = getPostgisStatus();
  if (!status.available) {
    throw ApiError.serviceUnavailable(
      'Impact and emergency analysis require the PostGIS extension, which is not enabled on this database.',
      { postgis: status },
    );
  }
}

export interface NearbyEmergencyFacility {
  id: string;
  name: string;
  type: EmergencyFacilityType;
  latitude: number;
  longitude: number;
  address: string | null;
  capacity: string | null;
  phone: string | null;
  operator: string | null;
  distanceMeters: number;
}

/**
 * Nearest emergency facility of any type, or of one specific type.
 *
 * Returns null rather than throwing when PostGIS is unavailable, because this
 * is called from the ingest loop where a missing receptor distance simply means
 * the populated-proximity risk component scores zero.
 */
export async function findNearestEmergencyFacility(
  latitude: number,
  longitude: number,
  type?: EmergencyFacilityType,
): Promise<NearbyEmergencyFacility | null> {
  if (!getPostgisStatus().available) return null;

  const rows = await prisma.$queryRaw<NearbyEmergencyFacility[]>`
    WITH origin AS (
      SELECT ST_SetSRID(ST_MakePoint(${longitude}::double precision, ${latitude}::double precision), 4326)::geography AS geog
    )
    SELECT
      e."id",
      e."name",
      e."type",
      e."latitude",
      e."longitude",
      e."address",
      e."capacity",
      e."phone",
      e."operator",
      ST_Distance(
        ST_SetSRID(ST_MakePoint(e."longitude", e."latitude"), 4326)::geography,
        origin.geog
      ) AS "distanceMeters"
    FROM "emergency_facilities" e, origin
    WHERE (${type ?? null}::"EmergencyFacilityType" IS NULL OR e."type" = ${type ?? null}::"EmergencyFacilityType")
    ORDER BY ST_SetSRID(ST_MakePoint(e."longitude", e."latitude"), 4326)::geography <-> origin.geog
    LIMIT 1
  `;

  return rows[0] ?? null;
}

/** Emergency facilities within a radius, nearest first. */
export async function findEmergencyFacilitiesNear(
  latitude: number,
  longitude: number,
  radiusKm: number,
  type?: EmergencyFacilityType,
  limit = 100,
): Promise<NearbyEmergencyFacility[]> {
  assertPostgis();

  return prisma.$queryRaw<NearbyEmergencyFacility[]>`
    WITH origin AS (
      SELECT ST_SetSRID(ST_MakePoint(${longitude}::double precision, ${latitude}::double precision), 4326)::geography AS geog
    )
    SELECT
      e."id",
      e."name",
      e."type",
      e."latitude",
      e."longitude",
      e."address",
      e."capacity",
      e."phone",
      e."operator",
      ST_Distance(
        ST_SetSRID(ST_MakePoint(e."longitude", e."latitude"), 4326)::geography,
        origin.geog
      ) AS "distanceMeters"
    FROM "emergency_facilities" e, origin
    WHERE ST_DWithin(
        ST_SetSRID(ST_MakePoint(e."longitude", e."latitude"), 4326)::geography,
        origin.geog,
        ${radiusKm * 1000}::double precision
      )
      AND (${type ?? null}::"EmergencyFacilityType" IS NULL OR e."type" = ${type ?? null}::"EmergencyFacilityType")
    ORDER BY "distanceMeters" ASC
    LIMIT ${limit}
  `;
}

// ---------------------------------------------------------------------------
// Impact analysis (brief section 11)
// ---------------------------------------------------------------------------

export interface ImpactZone {
  radiusKm: number;
  counts: {
    hospitals: number;
    fireStations: number;
    schools: number;
    police: number;
    industrialFacilities: number;
    otherHotspots: number;
  };
  /**
   * Population estimate.
   *
   * Always null: TIMS has no licensed gridded-population layer for Bhopal, and
   * the brief is explicit that an invented figure is worse than no figure. The
   * UI renders "Population estimate unavailable" when this is null.
   */
  populationEstimate: null;
}

export interface ImpactAnalysis {
  hotspotId: string;
  latitude: number;
  longitude: number;
  zones: ImpactZone[];
  nearestHospital: NearbyEmergencyFacility | null;
  nearestFireStation: NearbyEmergencyFacility | null;
  /** Straight-line distances. Road routing is a separate provider concern. */
  distanceNote: string;
  populationDataAvailable: false;
}

/**
 * Counts exposed receptors in concentric zones around a hotspot.
 *
 * Zone radii come from THRESHOLDS.impactZonesKm (1/3/5 km by default) so they
 * are configurable in one place rather than hardcoded here.
 */
export async function analyseImpact(hotspotId: string): Promise<ImpactAnalysis> {
  assertPostgis();

  const hotspot = await prisma.hotspot.findUnique({
    where: { id: hotspotId },
    select: { id: true, latitude: true, longitude: true },
  });
  if (!hotspot) throw ApiError.notFound(`Hotspot ${hotspotId} not found`);

  const { latitude, longitude } = hotspot;
  const radii = [...THRESHOLDS.impactZonesKm];

  // One query per zone, but each is an indexed ST_DWithin count — cheaper and
  // far more readable than a single query with five correlated subqueries.
  const zones: ImpactZone[] = [];

  for (const radiusKm of radii) {
    const radiusM = radiusKm * 1000;

    const rows = await prisma.$queryRaw<
      Array<{
        hospitals: bigint;
        firestations: bigint;
        schools: bigint;
        police: bigint;
        industrial: bigint;
        hotspots: bigint;
      }>
    >`
      WITH origin AS (
        SELECT ST_SetSRID(ST_MakePoint(${longitude}::double precision, ${latitude}::double precision), 4326)::geography AS geog
      )
      SELECT
        (SELECT COUNT(*) FROM "emergency_facilities" e, origin
          WHERE e."type" = 'HOSPITAL'
            AND ST_DWithin(ST_SetSRID(ST_MakePoint(e."longitude", e."latitude"), 4326)::geography, origin.geog, ${radiusM}::double precision)
        ) AS hospitals,
        (SELECT COUNT(*) FROM "emergency_facilities" e, origin
          WHERE e."type" = 'FIRE_STATION'
            AND ST_DWithin(ST_SetSRID(ST_MakePoint(e."longitude", e."latitude"), 4326)::geography, origin.geog, ${radiusM}::double precision)
        ) AS firestations,
        (SELECT COUNT(*) FROM "emergency_facilities" e, origin
          WHERE e."type" = 'SCHOOL'
            AND ST_DWithin(ST_SetSRID(ST_MakePoint(e."longitude", e."latitude"), 4326)::geography, origin.geog, ${radiusM}::double precision)
        ) AS schools,
        (SELECT COUNT(*) FROM "emergency_facilities" e, origin
          WHERE e."type" = 'POLICE'
            AND ST_DWithin(ST_SetSRID(ST_MakePoint(e."longitude", e."latitude"), 4326)::geography, origin.geog, ${radiusM}::double precision)
        ) AS police,
        (SELECT COUNT(*) FROM "industrial_facilities" f, origin
          WHERE ST_DWithin(ST_SetSRID(ST_MakePoint(f."longitude", f."latitude"), 4326)::geography, origin.geog, ${radiusM}::double precision)
        ) AS industrial,
        (SELECT COUNT(*) FROM "hotspots" h, origin
          WHERE h."id" <> ${hotspotId}
            AND ST_DWithin(ST_SetSRID(ST_MakePoint(h."longitude", h."latitude"), 4326)::geography, origin.geog, ${radiusM}::double precision)
        ) AS hotspots
    `;

    const row = rows[0];
    zones.push({
      radiusKm,
      counts: {
        hospitals: Number(row?.hospitals ?? 0),
        fireStations: Number(row?.firestations ?? 0),
        schools: Number(row?.schools ?? 0),
        police: Number(row?.police ?? 0),
        industrialFacilities: Number(row?.industrial ?? 0),
        otherHotspots: Number(row?.hotspots ?? 0),
      },
      populationEstimate: null,
    });
  }

  const [nearestHospital, nearestFireStation] = await Promise.all([
    findNearestEmergencyFacility(latitude, longitude, 'HOSPITAL'),
    findNearestEmergencyFacility(latitude, longitude, 'FIRE_STATION'),
  ]);

  return {
    hotspotId,
    latitude,
    longitude,
    zones,
    nearestHospital,
    nearestFireStation,
    distanceNote:
      'Distances are straight-line (geodesic) and do not account for road network or traffic. ' +
      'Decision support only — not an official emergency dispatch.',
    populationDataAvailable: false,
  };
}

/** Counts by type, for the emergency register and the data-coverage banner. */
export async function getEmergencyFacilitySummary(): Promise<{
  total: number;
  byType: Array<{ type: EmergencyFacilityType; count: number }>;
}> {
  const grouped = await prisma.emergencyFacility.groupBy({
    by: ['type'],
    _count: { _all: true },
  });

  return {
    total: grouped.reduce((sum, row) => sum + row._count._all, 0),
    byType: grouped
      .map((row) => ({ type: row.type, count: row._count._all }))
      .sort((a, b) => b.count - a.count),
  };
}
