import { env } from '../../../config/env';
import { getPostgisStatus } from '../../../config/postgis';
import { prisma } from '../../../config/prisma';
import type { EventType, RiskLevel } from '../../../generated/prisma/enums';
import { createLogger } from '../../../utils/logger';
import { regionForPoint } from '../../../utils/regions';
import { assessHotspot, PERSISTENT_SOURCE_DAYS, toAlertSeverity, toRiskLevel } from '../../../utils/risk';
import { raiseAlertForHotspot } from '../../alert.service';
import { findNearestFacility } from '../../geo.service';
import { getFirmsProvider } from './firms.provider';
import type { FirmsDetection } from './firms.types';

const log = createLogger('firms:ingest');

/**
 * Grid resolution used for persistence binning: 0.01 degrees is roughly 1.1 km,
 * which is about one VIIRS pixel. Two detections in the same cell on different
 * days are treated as the same physical source.
 *
 * This is spatial *binning*, not a distance calculation — it deliberately needs
 * no PostGIS so persistence still works on a plain PostgreSQL instance.
 */
const GRID_DEGREES = 0.01;
/** How far back to look when counting how long a source has been burning. */
const PERSISTENCE_LOOKBACK_DAYS = 30;

export interface FirmsIngestResult {
  provider: string;
  live: boolean;
  fetched: number;
  created: number;
  duplicates: number;
  failed: number;
  alertsRaised: number;
  durationMs: number;
  error?: string;
}

function gridCell(value: number): { min: number; max: number } {
  const cell = Math.floor(value / GRID_DEGREES);
  return { min: cell * GRID_DEGREES, max: (cell + 1) * GRID_DEGREES };
}

/**
 * Counts distinct prior days on which this grid cell was already burning.
 * Returns at least 1 (today's own detection).
 */
async function computePersistenceDays(detection: FirmsDetection): Promise<number> {
  const latCell = gridCell(detection.latitude);
  const lonCell = gridCell(detection.longitude);
  const since = new Date(detection.detectedAt.getTime() - PERSISTENCE_LOOKBACK_DAYS * 86_400_000);

  const rows = await prisma.$queryRaw<Array<{ days: bigint }>>`
    SELECT COUNT(DISTINCT date_trunc('day', h."detectedAt")) AS days
    FROM "hotspots" h
    WHERE h."latitude" >= ${latCell.min} AND h."latitude" < ${latCell.max}
      AND h."longitude" >= ${lonCell.min} AND h."longitude" < ${lonCell.max}
      AND h."detectedAt" >= ${since}
      AND h."detectedAt" <= ${detection.detectedAt}
  `;

  return Math.max(1, Number(rows[0]?.days ?? 0) + 1);
}

interface FacilityLink {
  industrialFacilityId: string | null;
  distanceToFacilityM: number | null;
}

async function linkFacility(detection: FirmsDetection): Promise<FacilityLink> {
  if (!getPostgisStatus().available) {
    return { industrialFacilityId: null, distanceToFacilityM: null };
  }
  try {
    const nearest = await findNearestFacility(detection.latitude, detection.longitude, 50);
    return nearest
      ? { industrialFacilityId: nearest.id, distanceToFacilityM: nearest.distanceMeters }
      : { industrialFacilityId: null, distanceToFacilityM: null };
  } catch (error) {
    log.warn('Facility linking failed for detection', {
      externalId: detection.externalId,
      error: error instanceof Error ? error.message : error,
    });
    return { industrialFacilityId: null, distanceToFacilityM: null };
  }
}

const ALERTABLE_TYPES: EventType[] = ['INDUSTRIAL_FIRE', 'GAS_FLARE'];

function shouldAlert(eventType: EventType, riskLevel: RiskLevel, persistenceDays: number): boolean {
  if (riskLevel === 'CRITICAL') return true;
  if (riskLevel === 'HIGH' && ALERTABLE_TYPES.includes(eventType)) return true;
  // A source burning for a week is worth flagging even at moderate intensity.
  return persistenceDays >= 7 && ALERTABLE_TYPES.includes(eventType);
}

function describeAlert(params: {
  eventType: EventType;
  riskScore: number;
  persistenceDays: number;
  facilityName: string | null;
  distanceToFacilityM: number | null;
  region: string | null;
}): { title: string; message: string } {
  const label = params.eventType.replace(/_/g, ' ').toLowerCase();
  const article = /^[aeiou]/.test(label) ? 'An' : 'A';
  const where = params.facilityName
    ? `${params.facilityName}${params.distanceToFacilityM != null ? ` (${Math.round(params.distanceToFacilityM)} m away)` : ''}`
    : (params.region ?? 'an unclassified area');

  return {
    title: `${params.eventType === 'GAS_FLARE' ? 'Persistent flare' : 'Thermal anomaly'} near ${params.facilityName ?? where}`,
    message:
      `${article} ${label} was detected near ${where}. ` +
      `Risk score ${params.riskScore}/100, active for ${params.persistenceDays} day(s). ` +
      `Verify against ground reports before escalation.`,
  };
}

function parseBbox(value: string): [number, number, number, number] {
  const parts = value.split(',').map(Number);
  if (parts.length !== 4 || parts.some(Number.isNaN)) return [68.0, 6.0, 98.0, 38.0];
  return parts as [number, number, number, number];
}

/**
 * Persists a batch of detections: de-duplicate, enrich, classify, score, alert.
 *
 * Exported so the seeder can reuse the exact same pipeline the cron job uses —
 * seeded data is therefore indistinguishable from ingested data.
 */
export async function ingestDetections(detections: FirmsDetection[]): Promise<{
  created: number;
  duplicates: number;
  failed: number;
  alertsRaised: number;
}> {
  let created = 0;
  let duplicates = 0;
  let failed = 0;
  let alertsRaised = 0;

  // Oldest first: persistence counting depends on earlier days already existing.
  const ordered = [...detections].sort((a, b) => a.detectedAt.getTime() - b.detectedAt.getTime());

  for (const detection of ordered) {
    try {
      const existing = await prisma.hotspot.findUnique({
        where: { externalId: detection.externalId },
        select: { id: true },
      });
      if (existing) {
        duplicates += 1;
        continue;
      }

      const [persistenceDays, facility] = await Promise.all([
        computePersistenceDays(detection),
        linkFacility(detection),
      ]);

      const { eventType, riskScore } = assessHotspot({
        brightnessTemperature: detection.brightnessTemperature,
        frp: detection.frp,
        confidence: detection.confidence,
        persistenceDays,
        distanceToFacilityM: facility.distanceToFacilityM,
        dayNight: detection.dayNight,
      });

      const riskLevel = toRiskLevel(riskScore);
      const region = regionForPoint(detection.latitude, detection.longitude);

      const hotspot = await prisma.hotspot.create({
        data: {
          externalId: detection.externalId,
          latitude: detection.latitude,
          longitude: detection.longitude,
          detectedAt: detection.detectedAt,
          confidence: detection.confidence,
          brightnessTemperature: detection.brightnessTemperature,
          frp: detection.frp,
          satellite: detection.satellite,
          dayNight: detection.dayNight,
          source: detection.source,
          region,
          persistenceDays,
          eventType,
          riskScore,
          riskLevel,
          industrialFacilityId: facility.industrialFacilityId,
          distanceToFacilityM: facility.distanceToFacilityM,
        },
        include: { industrialFacility: { select: { name: true } } },
      });

      created += 1;

      if (shouldAlert(eventType, riskLevel, persistenceDays)) {
        const { title, message } = describeAlert({
          eventType,
          riskScore,
          persistenceDays,
          facilityName: hotspot.industrialFacility?.name ?? null,
          distanceToFacilityM: facility.distanceToFacilityM,
          region,
        });

        const alert = await raiseAlertForHotspot({
          hotspotId: hotspot.id,
          title,
          message,
          severity: toAlertSeverity(riskLevel),
          // Anchored to the detection, not to wall-clock time, so replaying a
          // backlog produces the same alert timeline as live ingestion would.
          referenceTime: detection.detectedAt,
        });
        if (alert) alertsRaised += 1;
      }
    } catch (error) {
      failed += 1;
      log.warn('Failed to ingest detection', {
        externalId: detection.externalId,
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  return { created, duplicates, failed, alertsRaised };
}

/**
 * Full ingest cycle: fetch from the active provider, then persist.
 *
 * Never throws. A FIRMS outage, an expired MAP_KEY or a network failure is
 * reported in the returned result and logged; the API stays up.
 */
export async function runFirmsIngest(
  options: { bbox?: string; dayRange?: number; source?: string } = {},
): Promise<FirmsIngestResult> {
  const startedAt = Date.now();
  const provider = getFirmsProvider();

  const result: FirmsIngestResult = {
    provider: provider.name,
    live: provider.isLive,
    fetched: 0,
    created: 0,
    duplicates: 0,
    failed: 0,
    alertsRaised: 0,
    durationMs: 0,
  };

  try {
    const detections = await provider.fetchDetections({
      bbox: parseBbox(options.bbox ?? env.FIRMS_AREA),
      dayRange: options.dayRange ?? env.FIRMS_DAY_RANGE,
      source: options.source ?? env.FIRMS_SOURCE,
    });

    result.fetched = detections.length;
    Object.assign(result, await ingestDetections(detections));
  } catch (error) {
    result.error = error instanceof Error ? error.message : 'Unknown FIRMS error';
    log.error('FIRMS ingest failed', { error: result.error });
  }

  result.durationMs = Date.now() - startedAt;
  log.info('FIRMS ingest complete', result);
  return result;
}

/**
 * Recomputes persistence and re-scores every hotspot detected in the lookback
 * window. Run on a schedule: a source only reveals itself as *persistent* once
 * later days have also been ingested.
 */
export async function recomputePersistence(): Promise<{ examined: number; updated: number }> {
  const since = new Date(Date.now() - PERSISTENCE_LOOKBACK_DAYS * 86_400_000);

  const hotspots = await prisma.hotspot.findMany({
    where: { detectedAt: { gte: since } },
    select: {
      id: true,
      latitude: true,
      longitude: true,
      detectedAt: true,
      confidence: true,
      brightnessTemperature: true,
      frp: true,
      dayNight: true,
      persistenceDays: true,
      riskScore: true,
      distanceToFacilityM: true,
    },
  });

  let updated = 0;

  for (const hotspot of hotspots) {
    const latCell = gridCell(hotspot.latitude);
    const lonCell = gridCell(hotspot.longitude);

    const rows = await prisma.$queryRaw<Array<{ days: bigint }>>`
      SELECT COUNT(DISTINCT date_trunc('day', h."detectedAt")) AS days
      FROM "hotspots" h
      WHERE h."latitude" >= ${latCell.min} AND h."latitude" < ${latCell.max}
        AND h."longitude" >= ${lonCell.min} AND h."longitude" < ${lonCell.max}
        AND h."detectedAt" >= ${since}
    `;

    const persistenceDays = Math.max(1, Number(rows[0]?.days ?? 1));
    if (persistenceDays === hotspot.persistenceDays) continue;

    const { eventType, riskScore } = assessHotspot({
      brightnessTemperature: hotspot.brightnessTemperature,
      frp: hotspot.frp,
      confidence: hotspot.confidence,
      persistenceDays,
      distanceToFacilityM: hotspot.distanceToFacilityM,
      dayNight: hotspot.dayNight,
    });

    await prisma.hotspot.update({
      where: { id: hotspot.id },
      data: { persistenceDays, eventType, riskScore, riskLevel: toRiskLevel(riskScore) },
    });
    updated += 1;
  }

  log.info(`Persistence recompute finished: ${updated}/${hotspots.length} hotspots updated`);
  return { examined: hotspots.length, updated };
}

/** Threshold re-exported so controllers and the seeder agree on "persistent". */
export { PERSISTENT_SOURCE_DAYS };
