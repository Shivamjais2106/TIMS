import type { Request, Response } from 'express';
import {
  BHOPAL_BBOX,
  BHOPAL_BOUNDARY,
  MAP_DEFAULTS,
  PILOT,
  RISK_BANDS,
  RISK_WEIGHTS,
  THRESHOLDS,
} from '../config/bhopal';
import { env } from '../config/env';
import { prisma } from '../config/prisma';
import { getPostgisStatus } from '../config/postgis';
import { analyseImpact, getEmergencyFacilitySummary } from '../services/emergency.service';
import { getBoundary } from '../services/geo.service';
import { getMlServiceHealth } from '../services/classification.service';
import { getCurrentWeather, getWeatherProviderStatus } from '../services/weather.service';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/response';

/**
 * Bhopal pilot endpoints: geofence, impact, emergency, weather, transparency.
 */

/** Narrows Express's `string | string[] | undefined` query value to a number. */
function firstQueryNumber(value: unknown): number | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string' || raw.trim() === '') return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Narrows an Express query value to a trimmed string. */
function firstQueryString(value: unknown): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : undefined;
}

/** GET /api/boundaries/bhopal — the real district polygon plus provenance. */
export const boundary = asyncHandler(async (_req: Request, res: Response) => {
  const record = await getBoundary(PILOT.label);

  if (!record) {
    throw ApiError.serviceUnavailable(
      `No ${PILOT.label} boundary polygon has been loaded. Run \`npm run db:boundary\` in backend/.`,
    );
  }

  sendSuccess(res, {
    ...record,
    // The bbox is echoed so the client can see the distinction between the
    // cheap fetch envelope and the authoritative polygon.
    fetchBbox: BHOPAL_BBOX,
    map: MAP_DEFAULTS,
    note:
      'The polygon is the authoritative geofence (PostGIS ST_Within). The bounding box ' +
      'is only an API-level pre-filter used when requesting data from NASA FIRMS and Overpass.',
  });
});

/** GET /api/config — pilot scoping the frontend renders in the UI. */
export const config = asyncHandler(async (_req: Request, res: Response) => {
  sendSuccess(res, {
    pilot: PILOT,
    bbox: BHOPAL_BBOX,
    map: MAP_DEFAULTS,
    thresholds: THRESHOLDS,
    riskWeights: RISK_WEIGHTS,
    riskBands: RISK_BANDS,
    boundary: BHOPAL_BOUNDARY,
    demoMode: env.DEMO_MODE,
  });
});

/** GET /api/impact/:hotspotId — concentric-zone exposure analysis. */
export const impact = asyncHandler(async (req: Request, res: Response) => {
  const hotspotId = firstQueryString(req.params['hotspotId']);
  if (!hotspotId) throw ApiError.badRequest('hotspotId is required');

  sendSuccess(res, await analyseImpact(hotspotId));
});

/** GET /api/weather — current context, or an explicit "unavailable". */
export const weather = asyncHandler(async (req: Request, res: Response) => {
  // Express types a query value as string | string[]; a repeated ?lat= would
  // otherwise become NaN silently.
  const latitude = firstQueryNumber(req.query['lat']) ?? MAP_DEFAULTS.center[0];
  const longitude = firstQueryNumber(req.query['lon']) ?? MAP_DEFAULTS.center[1];

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw ApiError.badRequest('lat and lon must be numbers');
  }

  const result = await getCurrentWeather(latitude, longitude);

  // 200 even when unavailable: "we could not get weather" is a successful,
  // meaningful answer that the UI renders as a banner, not an error state.
  sendSuccess(res, { ...result, providers: getWeatherProviderStatus() });
});

/**
 * GET /api/datasources — the transparency register.
 *
 * Includes sources that are NOT wired up, with their real status, because an
 * honest "credentials required" is the point of this endpoint.
 */
export const dataSources = asyncHandler(async (_req: Request, res: Response) => {
  const sources = await prisma.dataSource.findMany({
    orderBy: [{ isGovernment: 'desc' }, { name: 'asc' }],
  });

  const [hotspots, facilities, emergency, boundaries, weatherRows] = await Promise.all([
    prisma.hotspot.count(),
    prisma.industrialFacility.count(),
    prisma.emergencyFacility.count(),
    prisma.administrativeBoundary.count(),
    prisma.weatherObservation.count(),
  ]);

  sendSuccess(res, {
    sources,
    // Live row counts, so a reviewer can confirm a "LIVE" claim against data
    // that actually exists rather than taking the status field on trust.
    recordCounts: {
      hotspots,
      industrialFacilities: facilities,
      emergencyFacilities: emergency,
      administrativeBoundaries: boundaries,
      weatherObservations: weatherRows,
    },
    capabilities: {
      postgis: getPostgisStatus(),
      firms: { configured: env.firmsEnabled },
      osm: { enabled: env.OSM_ENABLED },
      ml: getMlServiceHealth(),
      imd: { configured: env.imdEnabled },
      bhuvan: { configured: env.bhuvanEnabled },
      demoMode: env.DEMO_MODE,
    },
    disclaimer:
      'TIMS is a decision-support prototype. It is not an official emergency alerting ' +
      'or dispatch system, and classifications are advisory rather than adjudicated.',
  });
});

/** GET /api/emergency/summary — counts by type, plus coverage caveats. */
export const emergencySummary = asyncHandler(async (_req: Request, res: Response) => {
  const summary = await getEmergencyFacilitySummary();

  const fireStations = summary.byType.find((row) => row.type === 'FIRE_STATION')?.count ?? 0;

  sendSuccess(res, {
    ...summary,
    coverageNote:
      `Sourced from OpenStreetMap, which is community-maintained rather than an official register. ` +
      `Only ${fireStations} fire station(s) are mapped inside the pilot area, which is almost ` +
      `certainly an undercount — treat "nearest fire station" as indicative.`,
  });
});
