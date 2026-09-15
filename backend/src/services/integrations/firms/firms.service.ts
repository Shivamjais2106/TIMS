import { BHOPAL_BBOX, FIRMS_LIMITS, PILOT, THRESHOLDS } from '../../../config/bhopal';
import { env } from '../../../config/env';
import { getPostgisStatus } from '../../../config/postgis';
import { prisma } from '../../../config/prisma';
import { createLogger } from '../../../utils/logger';
import { filterWithinBoundary } from '../../geo.service';
import { getFirmsProvider } from './firms.provider';
import type { FirmsDetection, FirmsFetchParams, FirmsWindow } from './firms.types';

const log = createLogger('firms:ingest');

/** Bhopal pilot bbox as the [minLng, minLat, maxLng, maxLat] tuple FIRMS wants. */
const PILOT_BBOX: [number, number, number, number] = [
  BHOPAL_BBOX.minLng,
  BHOPAL_BBOX.minLat,
  BHOPAL_BBOX.maxLng,
  BHOPAL_BBOX.maxLat,
];

export interface FirmsFetchOutcome {
  detections: FirmsDetection[];
  window: FirmsWindow;
  /** Per-product counts, so a single failing product is visible in the logs. */
  perProduct: Record<string, number>;
  errors: string[];
}

function parseBboxOverride(value: string): [number, number, number, number] | null {
  if (!value.trim()) return null;
  const parts = value.split(',').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) {
    log.warn(`FIRMS_AREA="${value}" is not a valid bbox; falling back to the Bhopal pilot bbox`);
    return null;
  }
  return parts as [number, number, number, number];
}

/** Resolves the area of interest: an explicit override, else the pilot bbox. */
export function resolveBbox(override?: string): [number, number, number, number] {
  return parseBboxOverride(override ?? env.FIRMS_AREA) ?? PILOT_BBOX;
}

/** Inclusive list of archive start dates covering [from, to] in dayRange steps. */
function archiveWindows(from: string, to: string, dayRange: number): string[] {
  const starts: string[] = [];
  const end = new Date(`${to}T00:00:00Z`).getTime();
  let cursor = new Date(`${from}T00:00:00Z`).getTime();
  const step = dayRange * 86_400_000;

  while (cursor <= end) {
    starts.push(new Date(cursor).toISOString().slice(0, 10));
    cursor += step;
  }
  return starts;
}

async function fetchProduct(params: FirmsFetchParams): Promise<FirmsDetection[]> {
  return getFirmsProvider().fetchDetections(params);
}

/**
 * Fetches real FIRMS detections for the pilot area.
 *
 * Strategy, in order:
 *   1. Live NRT across all NRT products for the trailing `dayRange` days.
 *   2. If that yields fewer than FIRMS_MIN_LIVE_RECORDS rows, ALSO sweep the
 *      FIRMS archive (SP products) over a documented historical fire season.
 *
 * Step 2 exists because the 25 km Bhopal pilot bbox genuinely has no NRT
 * detections outside the burning season - verified against the live API on
 * 2026-09-15, which returned 0 rows for every NRT product at every day range.
 * The window actually used is recorded on the returned `window` object, logged,
 * and surfaced in the UI. Synthetic data is never substituted.
 */
export async function fetchBhopalDetections(
  options: { bbox?: string; dayRange?: number; forceArchive?: boolean } = {},
): Promise<FirmsFetchOutcome> {
  const bbox = resolveBbox(options.bbox);
  const dayRange = Math.min(options.dayRange ?? env.FIRMS_DAY_RANGE, FIRMS_LIMITS.maxDayRange);
  const perProduct: Record<string, number> = {};
  const errors: string[] = [];
  const detections: FirmsDetection[] = [];

  if (!options.forceArchive) {
    for (const product of FIRMS_LIMITS.nrtProducts) {
      try {
        const rows = await fetchProduct({ bbox, dayRange, product });
        perProduct[product] = rows.length;
        detections.push(...rows);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        perProduct[product] = 0;
        errors.push(`${product}: ${message}`);
        log.warn(`NRT fetch failed for ${product}`, { error: message });
      }
    }

    if (detections.length >= env.FIRMS_MIN_LIVE_RECORDS) {
      return {
        detections,
        window: {
          kind: 'live-nrt',
          description: `Live NRT, trailing ${dayRange} day(s)`,
          products: [...FIRMS_LIMITS.nrtProducts],
          dayRange,
        },
        perProduct,
        errors,
      };
    }

    log.warn(
      `Live NRT returned ${detections.length} detection(s) for the ${PILOT.label} pilot bbox ` +
        `(threshold ${env.FIRMS_MIN_LIVE_RECORDS}). ` +
        (env.FIRMS_ARCHIVE_FALLBACK
          ? 'Widening to the FIRMS archive fire season.'
          : 'Archive fallback is disabled; returning the live result as-is.'),
    );

    if (!env.FIRMS_ARCHIVE_FALLBACK) {
      return {
        detections,
        window: {
          kind: 'live-nrt',
          description: `Live NRT, trailing ${dayRange} day(s) - no detections in window`,
          products: [...FIRMS_LIMITS.nrtProducts],
          dayRange,
        },
        perProduct,
        errors,
      };
    }
  }

  // --- Archive sweep --------------------------------------------------------
  // Sweeps every configured fire season, not just the most recent one.
  //
  // A single season yielded 434 detections, of which only 8 fell within 1 km of
  // a mapped industrial site. That is too few to evaluate an industrial class
  // on a 20% test split, so the sweep covers multiple seasons to obtain more
  // *real* detections. Oversampling or synthesising minority-class rows was
  // rejected: more real data is strictly better than invented data.
  const seasons = FIRMS_LIMITS.archiveSeasons;
  const sweptSeasons: string[] = [];

  log.info(
    `FIRMS archive sweep: ${FIRMS_LIMITS.archiveProducts.length} product(s) across ` +
      `${seasons.length} season(s) in ${dayRange}-day windows`,
  );

  for (const season of seasons) {
    const starts = archiveWindows(season.from, season.to, dayRange);
    sweptSeasons.push(`${season.label} (${season.from}..${season.to}, ${starts.length} windows)`);

    for (const product of FIRMS_LIMITS.archiveProducts) {
      let productTotal = perProduct[product] ?? 0;

      for (const startDate of starts) {
        try {
          const rows = await fetchProduct({ bbox, dayRange, product, startDate });
          productTotal += rows.length;
          detections.push(...rows);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          // A product with no archive coverage for an older season answers with
          // an error; that is expected, not fatal, so the sweep continues.
          errors.push(`${product}@${startDate}: ${message}`);
        }
      }

      perProduct[product] = productTotal;
    }

    log.info(`  swept ${season.label}: running total ${detections.length} detection(s)`);
  }

  // Explicit string arrays: reducing over the readonly tuple directly makes
  // TypeScript infer the element object type rather than string.
  const froms: string[] = seasons.map((season) => season.from);
  const tos: string[] = seasons.map((season) => season.to);
  const from = froms.length > 0 ? froms.reduce((min, value) => (value < min ? value : min)) : '';
  const to = tos.length > 0 ? tos.reduce((max, value) => (value > max ? value : max)) : '';

  return {
    detections,
    window: {
      kind: 'archive',
      description:
        `FIRMS archive, ${seasons.length} season(s) ${from} to ${to}: ` +
        seasons.map((s) => s.label).join('; '),
      products: [...FIRMS_LIMITS.archiveProducts],
      from,
      to,
      dayRange,
      seasons: sweptSeasons,
    },
    perProduct,
    errors,
  };
}

// ---------------------------------------------------------------------------
// Geospatial feature computation (Part 4, Step 3)
// ---------------------------------------------------------------------------

export interface GeospatialFeatures {
  /** Metres to the nearest industrial facility, or null when none exists. */
  distanceToFacilityM: number | null;
  industrialFacilityId: string | null;
  /**
   * Distinct days this ~1 km neighbourhood has been detected within the
   * lookback window, including the detection being scored.
   */
  persistenceDays: number;
  /** Total detections within the persistence radius, regardless of day. */
  recurrenceCount: number;
}

/**
 * Computes the geospatial features the classifier consumes, for one point.
 *
 * Both the distance and the recurrence count are computed by PostGIS
 * (ST_DWithin / KNN) rather than in JavaScript, so they are true geodesic
 * metres on the WGS84 spheroid and can use the GiST indexes.
 */
export async function computeGeospatialFeatures(
  latitude: number,
  longitude: number,
  detectedAt: Date,
): Promise<GeospatialFeatures> {
  if (!getPostgisStatus().available) {
    // Nulls rather than a Haversine approximation: a fabricated distance would
    // silently corrupt every downstream classification.
    return {
      distanceToFacilityM: null,
      industrialFacilityId: null,
      persistenceDays: 1,
      recurrenceCount: 1,
    };
  }

  const since = new Date(detectedAt.getTime() - THRESHOLDS.persistenceLookbackDays * 86_400_000);

  const nearestRows = await prisma.$queryRaw<Array<{ id: string; meters: number }>>`
    WITH origin AS (
      SELECT ST_SetSRID(ST_MakePoint(${longitude}::double precision, ${latitude}::double precision), 4326)::geography AS geog
    )
    SELECT
      f."id",
      ST_Distance(
        ST_SetSRID(ST_MakePoint(f."longitude", f."latitude"), 4326)::geography,
        origin.geog
      ) AS meters
    FROM "industrial_facilities" f, origin
    ORDER BY ST_SetSRID(ST_MakePoint(f."longitude", f."latitude"), 4326)::geography <-> origin.geog
    LIMIT 1
  `;
  const nearest = nearestRows[0];

  // Recurrence uses a true metric radius, unlike the degree-grid binning this
  // replaced - a 0.01 degree cell is not a constant distance across latitudes.
  const recurrenceRows = await prisma.$queryRaw<Array<{ days: bigint; detections: bigint }>>`
    WITH origin AS (
      SELECT ST_SetSRID(ST_MakePoint(${longitude}::double precision, ${latitude}::double precision), 4326)::geography AS geog
    )
    SELECT
      COUNT(DISTINCT date_trunc('day', h."detectedAt")) AS days,
      COUNT(*) AS detections
    FROM "hotspots" h, origin
    WHERE h."detectedAt" >= ${since}
      AND h."detectedAt" <= ${detectedAt}
      AND ST_DWithin(
        ST_SetSRID(ST_MakePoint(h."longitude", h."latitude"), 4326)::geography,
        origin.geog,
        ${THRESHOLDS.persistenceRadiusM}::double precision
      )
  `;
  const recurrence = recurrenceRows[0];

  return {
    distanceToFacilityM: nearest?.meters ?? null,
    industrialFacilityId: nearest?.id ?? null,
    // +1 counts the detection being scored, which is not yet persisted.
    persistenceDays: Math.max(1, Number(recurrence?.days ?? 0) + 1),
    recurrenceCount: Math.max(1, Number(recurrence?.detections ?? 0) + 1),
  };
}

/**
 * Recomputes persistence for every hotspot in the lookback window.
 *
 * Run on a schedule: a source only reveals itself as persistent once later days
 * have also been ingested, so the value written at ingest time is a floor.
 *
 * One set-based pass over the geography index, rather than a round trip per
 * hotspot as the previous implementation did.
 */
export async function recomputePersistence(
  options: { allTime?: boolean } = {},
): Promise<{ examined: number; updated: number }> {
  if (!getPostgisStatus().available) {
    log.warn('Skipping persistence recompute - PostGIS unavailable');
    return { examined: 0, updated: 0 };
  }

  const lookbackDays = THRESHOLDS.persistenceLookbackDays;

  // Which hotspots to recompute.
  //
  // Anchored to the newest detection rather than wall-clock time: after an
  // archive read the data is months old, so a `now - 30 days` window selected
  // zero rows and the recompute silently did nothing.
  //
  // `allTime` widens it to every stored hotspot, which is required after a
  // multi-season sweep - each row's own 30-day neighbourhood is still what gets
  // counted (see the join below), but every row needs revisiting because rows
  // inserted later change the counts of rows inserted earlier.
  const newest = await prisma.hotspot.aggregate({ _max: { detectedAt: true } });
  const anchor = newest._max.detectedAt ?? new Date();
  const since = options.allTime
    ? new Date(0)
    : new Date(anchor.getTime() - lookbackDays * 86_400_000);

  log.info('Persistence recompute window', {
    scope: options.allTime ? 'all-time' : `trailing ${lookbackDays} day(s)`,
    anchoredTo: anchor.toISOString(),
    since: since.toISOString(),
  });

  const updated = await prisma.$executeRaw`
    WITH recomputed AS (
      SELECT
        h."id" AS hid,
        GREATEST(1, COUNT(DISTINCT date_trunc('day', n."detectedAt"))::int) AS days
      FROM "hotspots" h
      LEFT JOIN "hotspots" n
        ON n."detectedAt" <= h."detectedAt"
       AND n."detectedAt" >= h."detectedAt" - make_interval(days => ${lookbackDays}::int)
       AND ST_DWithin(
             ST_SetSRID(ST_MakePoint(n."longitude", n."latitude"), 4326)::geography,
             ST_SetSRID(ST_MakePoint(h."longitude", h."latitude"), 4326)::geography,
             ${THRESHOLDS.persistenceRadiusM}::double precision
           )
      WHERE h."detectedAt" >= ${since}
      GROUP BY h."id"
    )
    UPDATE "hotspots" h
    SET "persistenceDays" = r.days, "updatedAt" = NOW()
    FROM recomputed r
    WHERE h."id" = r.hid AND h."persistenceDays" <> r.days
  `;

  const examined = await prisma.hotspot.count({ where: { detectedAt: { gte: since } } });
  log.info(`Persistence recompute finished: ${updated}/${examined} hotspot(s) updated`);
  return { examined, updated };
}

/**
 * Backfills the Bhopal geofence flag with a single set-based ST_Within pass.
 *
 * Kept separate from ingest so the flag can be recomputed after the boundary
 * polygon is reloaded, without re-fetching anything from NASA.
 */
export async function recomputeBoundaryFlags(boundaryName: string = PILOT.label): Promise<number> {
  if (!getPostgisStatus().available) return 0;

  const updated = await prisma.$executeRaw`
    UPDATE "hotspots" h
    SET "inBhopalBoundary" = ST_Within(
          ST_SetSRID(ST_MakePoint(h."longitude", h."latitude"), 4326),
          b."geom"
        ),
        "updatedAt" = NOW()
    FROM "administrative_boundaries" b
    WHERE b."name" = ${boundaryName}
      AND b."geom" IS NOT NULL
      AND h."inBhopalBoundary" IS DISTINCT FROM ST_Within(
            ST_SetSRID(ST_MakePoint(h."longitude", h."latitude"), 4326),
            b."geom"
          )
  `;

  log.info(`Boundary flag recompute: ${updated} hotspot(s) updated`);
  return updated;
}

export { filterWithinBoundary };
