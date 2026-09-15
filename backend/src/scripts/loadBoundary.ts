import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BHOPAL_BOUNDARY, PILOT } from '../config/bhopal';
import { detectPostgis } from '../config/postgis';
import { disconnectPrisma, prisma } from '../config/prisma';
import { createLogger } from '../utils/logger';

const log = createLogger('boundary');

/**
 * Loads the authoritative Bhopal district polygon into PostGIS.
 *
 * This is what makes the geofence real: once loaded, every ingest asks
 * `ST_Within(point, geom)` instead of comparing against a bounding box, so a
 * detection in the bbox corner that falls outside the district is correctly
 * excluded from Bhopal incident counts.
 *
 * Idempotent — re-running replaces the geometry in place.
 *
 *   npm run db:boundary
 */

/** Tolerance in degrees for the simplified copy served to the map. */
const SIMPLIFY_TOLERANCE_DEG = 0.0005;

interface BoundaryFeatureCollection {
  features: Array<{
    properties: Record<string, unknown>;
    geometry: { type: string; coordinates: unknown };
  }>;
  metadata?: Record<string, unknown>;
}

async function main(): Promise<void> {
  const status = await detectPostgis();
  if (!status.available) {
    log.error('PostGIS is not available — cannot load the boundary polygon.', { reason: status.reason });
    process.exitCode = 1;
    return;
  }

  const path = join(__dirname, '../../prisma/data/bhopal-boundary.geojson');
  const collection = JSON.parse(readFileSync(path, 'utf8')) as BoundaryFeatureCollection;
  const feature = collection.features[0];

  if (!feature) {
    log.error('Boundary file contains no features', { path });
    process.exitCode = 1;
    return;
  }

  const geometryJson = JSON.stringify(feature.geometry);

  // Envelope is derived from the geometry itself rather than trusted from the
  // config, so the cached bounds can never drift from the polygon.
  const [envelope] = await prisma.$queryRaw<
    Array<{ minlng: number; minlat: number; maxlng: number; maxlat: number; areakm2: number; valid: boolean }>
  >`
    WITH g AS (
      SELECT ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(${geometryJson}), 4326)) AS geom
    )
    SELECT
      ST_XMin(geom) AS minlng,
      ST_YMin(geom) AS minlat,
      ST_XMax(geom) AS maxlng,
      ST_YMax(geom) AS maxlat,
      ST_Area(geom::geography) / 1000000.0 AS areakm2,
      ST_IsValid(geom) AS valid
    FROM g
  `;

  if (!envelope) {
    log.error('Could not compute the boundary envelope');
    process.exitCode = 1;
    return;
  }

  if (!envelope.valid) {
    log.warn('Boundary polygon is not OGC-valid; ST_MakeValid will be applied on load');
  }

  const record = await prisma.administrativeBoundary.upsert({
    where: { name_level: { name: PILOT.label, level: BHOPAL_BOUNDARY.adminLevel } },
    update: {
      state: PILOT.state,
      country: PILOT.country,
      osmId: `${BHOPAL_BOUNDARY.osmType}/${BHOPAL_BOUNDARY.osmId}`,
      minLng: envelope.minlng,
      minLat: envelope.minlat,
      maxLng: envelope.maxlng,
      maxLat: envelope.maxlat,
      source: BHOPAL_BOUNDARY.source,
      sourceUrl: BHOPAL_BOUNDARY.sourceUrl,
      license: BHOPAL_BOUNDARY.license,
      attribution: BHOPAL_BOUNDARY.attribution,
      retrievedAt: new Date(BHOPAL_BOUNDARY.retrievedAt),
    },
    create: {
      name: PILOT.label,
      level: BHOPAL_BOUNDARY.adminLevel,
      state: PILOT.state,
      country: PILOT.country,
      osmId: `${BHOPAL_BOUNDARY.osmType}/${BHOPAL_BOUNDARY.osmId}`,
      minLng: envelope.minlng,
      minLat: envelope.minlat,
      maxLng: envelope.maxlng,
      maxLat: envelope.maxlat,
      source: BHOPAL_BOUNDARY.source,
      sourceUrl: BHOPAL_BOUNDARY.sourceUrl,
      license: BHOPAL_BOUNDARY.license,
      attribution: BHOPAL_BOUNDARY.attribution,
      retrievedAt: new Date(BHOPAL_BOUNDARY.retrievedAt),
    },
  });

  // The geometry column is invisible to Prisma, so it is written separately.
  // ST_MakeValid guards against self-intersections in upstream OSM data.
  await prisma.$executeRaw`
    UPDATE "administrative_boundaries"
    SET "geom" = ST_Multi(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(${geometryJson}), 4326)))
    WHERE "id" = ${record.id}
  `;

  // Simplified copy for map rendering — the full 7k-vertex ring is far more
  // detail than a 12-zoom Leaflet view can show, and shipping it on every
  // page load would dominate the payload.
  const [simplified] = await prisma.$queryRaw<Array<{ geojson: string; vertices: number }>>`
    SELECT
      ST_AsGeoJSON(ST_SimplifyPreserveTopology("geom", ${SIMPLIFY_TOLERANCE_DEG}::double precision)) AS geojson,
      ST_NPoints(ST_SimplifyPreserveTopology("geom", ${SIMPLIFY_TOLERANCE_DEG}::double precision)) AS vertices
    FROM "administrative_boundaries"
    WHERE "id" = ${record.id}
  `;

  if (simplified) {
    await prisma.administrativeBoundary.update({
      where: { id: record.id },
      data: { simplifiedGeoJson: JSON.parse(simplified.geojson) },
    });
  }

  const [check] = await prisma.$queryRaw<Array<{ vertices: number; inside: boolean }>>`
    SELECT
      ST_NPoints("geom") AS vertices,
      ST_Within(ST_SetSRID(ST_MakePoint(77.425, 23.225), 4326), "geom") AS inside
    FROM "administrative_boundaries"
    WHERE "id" = ${record.id}
  `;

  log.info('Bhopal boundary loaded', {
    id: record.id,
    source: `${BHOPAL_BOUNDARY.osmType}/${BHOPAL_BOUNDARY.osmId}`,
    areaKm2: Math.round(envelope.areakm2),
    vertices: Number(check?.vertices ?? 0),
    simplifiedVertices: Number(simplified?.vertices ?? 0),
    envelope: {
      minLng: envelope.minlng,
      minLat: envelope.minlat,
      maxLng: envelope.maxlng,
      maxLat: envelope.maxlat,
    },
    // Sanity assertion: the map centre must be inside its own district.
    centreInsideBoundary: check?.inside ?? false,
  });

  if (!check?.inside) {
    log.error('Map centre is NOT inside the loaded boundary — check the polygon.');
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    log.error('Boundary load failed', { error: error instanceof Error ? error.message : error });
    process.exitCode = 1;
  })
  .finally(() => void disconnectPrisma());
