import { getPostgisStatus } from '../config/postgis';
import { prisma } from '../config/prisma';
import type { EventType, FacilityType, RiskLevel } from '../generated/prisma/enums';
import { ApiError } from '../utils/ApiError';
import type { BoundingBox } from '../validators/common.schema';

/**
 * All genuine geospatial work lives here and is executed by PostGIS.
 *
 * Every query builds the point with the same expression that the functional
 * GiST indexes in `20260101000100_postgis_geospatial` were created over:
 *
 *   ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
 *
 * so the planner can use those indexes for ST_DWithin and KNN ordering.
 */

function assertPostgis(): void {
  const status = getPostgisStatus();
  if (!status.available) {
    throw ApiError.serviceUnavailable(
      'Geospatial queries require the PostGIS extension, which is not enabled on this database. ' +
        'Run CREATE EXTENSION postgis (or apply the Prisma migrations) and restart the API.',
      { postgis: status },
    );
  }
}

export interface NearbyFacility {
  id: string;
  name: string;
  type: FacilityType;
  latitude: number;
  longitude: number;
  location: string;
  riskLevel: RiskLevel;
  operator: string | null;
  distanceMeters: number;
}

export interface NearbyHotspot {
  id: string;
  latitude: number;
  longitude: number;
  detectedAt: Date;
  eventType: EventType;
  riskLevel: RiskLevel;
  riskScore: number;
  confidence: number;
  brightnessTemperature: number;
  persistenceDays: number;
  distanceMeters: number;
}

/** Industrial facilities within `radiusKm` of a point, nearest first. */
export async function findFacilitiesNearPoint(
  latitude: number,
  longitude: number,
  radiusKm: number,
  limit = 50,
): Promise<NearbyFacility[]> {
  assertPostgis();
  const radiusMeters = radiusKm * 1000;

  return prisma.$queryRaw<NearbyFacility[]>`
    WITH origin AS (
      SELECT ST_SetSRID(ST_MakePoint(${longitude}::double precision, ${latitude}::double precision), 4326)::geography AS geog
    )
    SELECT
      f."id",
      f."name",
      f."type",
      f."latitude",
      f."longitude",
      f."location",
      f."riskLevel",
      f."operator",
      ST_Distance(
        ST_SetSRID(ST_MakePoint(f."longitude", f."latitude"), 4326)::geography,
        origin.geog
      ) AS "distanceMeters"
    FROM "industrial_facilities" f, origin
    WHERE ST_DWithin(
      ST_SetSRID(ST_MakePoint(f."longitude", f."latitude"), 4326)::geography,
      origin.geog,
      ${radiusMeters}::double precision
    )
    ORDER BY "distanceMeters" ASC
    LIMIT ${limit}
  `;
}

/** Thermal hotspots within `radiusKm` of a point, nearest first. */
export async function findHotspotsNearPoint(
  latitude: number,
  longitude: number,
  radiusKm: number,
  limit = 50,
): Promise<NearbyHotspot[]> {
  assertPostgis();
  const radiusMeters = radiusKm * 1000;

  return prisma.$queryRaw<NearbyHotspot[]>`
    WITH origin AS (
      SELECT ST_SetSRID(ST_MakePoint(${longitude}::double precision, ${latitude}::double precision), 4326)::geography AS geog
    )
    SELECT
      h."id",
      h."latitude",
      h."longitude",
      h."detectedAt",
      h."eventType",
      h."riskLevel",
      h."riskScore",
      h."confidence",
      h."brightnessTemperature",
      h."persistenceDays",
      ST_Distance(
        ST_SetSRID(ST_MakePoint(h."longitude", h."latitude"), 4326)::geography,
        origin.geog
      ) AS "distanceMeters"
    FROM "hotspots" h, origin
    WHERE ST_DWithin(
      ST_SetSRID(ST_MakePoint(h."longitude", h."latitude"), 4326)::geography,
      origin.geog,
      ${radiusMeters}::double precision
    )
    ORDER BY "distanceMeters" ASC
    LIMIT ${limit}
  `;
}

/**
 * Nearest facility to a coordinate, using the KNN distance operator so PostGIS
 * can walk the GiST index instead of scanning the table.
 */
export async function findNearestFacility(
  latitude: number,
  longitude: number,
  maxDistanceKm = 50,
): Promise<NearbyFacility | null> {
  assertPostgis();
  const maxDistanceMeters = maxDistanceKm * 1000;

  const rows = await prisma.$queryRaw<NearbyFacility[]>`
    WITH origin AS (
      SELECT ST_SetSRID(ST_MakePoint(${longitude}::double precision, ${latitude}::double precision), 4326)::geography AS geog
    )
    SELECT
      f."id",
      f."name",
      f."type",
      f."latitude",
      f."longitude",
      f."location",
      f."riskLevel",
      f."operator",
      ST_Distance(
        ST_SetSRID(ST_MakePoint(f."longitude", f."latitude"), 4326)::geography,
        origin.geog
      ) AS "distanceMeters"
    FROM "industrial_facilities" f, origin
    WHERE ST_DWithin(
      ST_SetSRID(ST_MakePoint(f."longitude", f."latitude"), 4326)::geography,
      origin.geog,
      ${maxDistanceMeters}::double precision
    )
    ORDER BY ST_SetSRID(ST_MakePoint(f."longitude", f."latitude"), 4326)::geography <-> origin.geog
    LIMIT 1
  `;

  return rows[0] ?? null;
}

/** Point-in-polygon: hotspots contained by an arbitrary GeoJSON polygon. */
export async function findHotspotsInPolygon(
  polygon: { type: 'Polygon'; coordinates: number[][][] },
  limit = 500,
): Promise<NearbyHotspot[]> {
  assertPostgis();
  const geoJson = JSON.stringify(polygon);

  return prisma.$queryRaw<NearbyHotspot[]>`
    WITH area AS (
      SELECT ST_SetSRID(ST_GeomFromGeoJSON(${geoJson}), 4326) AS geom
    )
    SELECT
      h."id",
      h."latitude",
      h."longitude",
      h."detectedAt",
      h."eventType",
      h."riskLevel",
      h."riskScore",
      h."confidence",
      h."brightnessTemperature",
      h."persistenceDays",
      0::double precision AS "distanceMeters"
    FROM "hotspots" h, area
    WHERE ST_Contains(area.geom, ST_SetSRID(ST_MakePoint(h."longitude", h."latitude"), 4326))
    ORDER BY h."riskScore" DESC
    LIMIT ${limit}
  `;
}

/** Distance in metres between two coordinates, computed on the WGS84 spheroid. */
export async function distanceBetween(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
): Promise<number> {
  assertPostgis();

  const rows = await prisma.$queryRaw<Array<{ meters: number }>>`
    SELECT ST_Distance(
      ST_SetSRID(ST_MakePoint(${from.longitude}::double precision, ${from.latitude}::double precision), 4326)::geography,
      ST_SetSRID(ST_MakePoint(${to.longitude}::double precision, ${to.latitude}::double precision), 4326)::geography
    ) AS meters
  `;

  return rows[0]?.meters ?? 0;
}

/**
 * Bounding-box filter expressed as a Prisma `where` fragment.
 *
 * Unlike the functions above this needs no PostGIS, which is why filtering the
 * hotspot list by map viewport still works on a plain PostgreSQL instance.
 */
export function bboxWhere(bbox: BoundingBox) {
  return {
    latitude: { gte: bbox.minLat, lte: bbox.maxLat },
    longitude: { gte: bbox.minLon, lte: bbox.maxLon },
  };
}

// ---------------------------------------------------------------------------
// Bhopal geofence — authoritative point-in-polygon against the loaded district
// ---------------------------------------------------------------------------

/**
 * True when the point falls inside the named administrative boundary.
 *
 * This is the authoritative Bhopal test. The bounding box used by the FIRMS and
 * Overpass fetchers is only a cheap API-level pre-filter; a detection in the
 * north-west corner of the bbox can sit outside the district, and must not be
 * counted as a Bhopal incident.
 *
 * Returns null when no boundary has been loaded, which the caller must treat as
 * "unknown" rather than "outside" — silently marking every detection as outside
 * Bhopal would empty the dashboard with no visible cause.
 */
export async function isWithinBoundary(
  latitude: number,
  longitude: number,
  boundaryName = 'Bhopal',
): Promise<boolean | null> {
  assertPostgis();

  const rows = await prisma.$queryRaw<Array<{ inside: boolean }>>`
    SELECT ST_Within(
      ST_SetSRID(ST_MakePoint(${longitude}::double precision, ${latitude}::double precision), 4326),
      b."geom"
    ) AS inside
    FROM "administrative_boundaries" b
    WHERE b."name" = ${boundaryName} AND b."geom" IS NOT NULL
    LIMIT 1
  `;

  return rows.length === 0 ? null : (rows[0]?.inside ?? false);
}

/**
 * Batch form of {@link isWithinBoundary}.
 *
 * One round trip for a whole ingest batch instead of one per detection: a
 * 400-row FIRMS batch would otherwise mean 400 sequential queries.
 */
export async function filterWithinBoundary(
  points: Array<{ latitude: number; longitude: number }>,
  boundaryName = 'Bhopal',
): Promise<boolean[] | null> {
  assertPostgis();
  if (points.length === 0) return [];

  const boundary = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT b."id" FROM "administrative_boundaries" b
    WHERE b."name" = ${boundaryName} AND b."geom" IS NOT NULL
    LIMIT 1
  `;
  if (boundary.length === 0) return null;

  // Points are passed as parallel arrays and re-joined with UNNEST + ordinality
  // so result order is guaranteed to match the input order.
  const lats = points.map((point) => point.latitude);
  const lngs = points.map((point) => point.longitude);

  const rows = await prisma.$queryRaw<Array<{ idx: number; inside: boolean }>>`
    WITH b AS (
      SELECT "geom" FROM "administrative_boundaries"
      WHERE "name" = ${boundaryName} AND "geom" IS NOT NULL
      LIMIT 1
    ),
    p AS (
      SELECT ordinality AS idx, lat, lng
      FROM UNNEST(${lats}::double precision[], ${lngs}::double precision[])
        WITH ORDINALITY AS t(lat, lng, ordinality)
    )
    SELECT p.idx::int AS idx,
           ST_Within(ST_SetSRID(ST_MakePoint(p.lng, p.lat), 4326), b."geom") AS inside
    FROM p, b
    ORDER BY p.idx
  `;

  const result = new Array<boolean>(points.length).fill(false);
  for (const row of rows) result[Number(row.idx) - 1] = row.inside;
  return result;
}

export interface BoundaryRecord {
  id: string;
  name: string;
  level: string;
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
  areaKm2: number;
  simplifiedGeoJson: unknown;
  source: string;
  sourceUrl: string | null;
  license: string | null;
  attribution: string | null;
  retrievedAt: Date | null;
}

/** The boundary polygon plus provenance, for the map and the transparency page. */
export async function getBoundary(boundaryName = 'Bhopal'): Promise<BoundaryRecord | null> {
  const record = await prisma.administrativeBoundary.findFirst({
    where: { name: boundaryName },
  });
  if (!record) return null;

  let areaKm2 = 0;
  if (getPostgisStatus().available) {
    const rows = await prisma.$queryRaw<Array<{ km2: number }>>`
      SELECT COALESCE(ST_Area("geom"::geography) / 1000000.0, 0) AS km2
      FROM "administrative_boundaries" WHERE "id" = ${record.id}
    `;
    areaKm2 = Math.round((rows[0]?.km2 ?? 0) * 10) / 10;
  }

  return {
    id: record.id,
    name: record.name,
    level: record.level,
    minLng: record.minLng,
    minLat: record.minLat,
    maxLng: record.maxLng,
    maxLat: record.maxLat,
    areaKm2,
    simplifiedGeoJson: record.simplifiedGeoJson,
    source: record.source,
    sourceUrl: record.sourceUrl,
    license: record.license,
    attribution: record.attribution,
    retrievedAt: record.retrievedAt,
  };
}
