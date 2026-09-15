import { PILOT, THRESHOLDS } from '../config/bhopal';
import { getPostgisStatus } from '../config/postgis';
import { prisma } from '../config/prisma';
import { Prisma } from '../generated/prisma/client';
import type { ClassificationPath, RiskLevel, ThermalClass } from '../generated/prisma/enums';
import { emitIngestStatus } from '../realtime';
import { createLogger } from '../utils/logger';
import { assessRisk, THERMAL_CLASS_LABELS, toAlertSeverity, toEventType } from '../utils/risk';
import { raiseAlertForHotspot } from './alert.service';
import { classify, isHighConfidenceIndustrial } from './classification.service';
import { findNearestEmergencyFacility } from './emergency.service';
import {
  computeGeospatialFeatures,
  fetchBhopalDetections,
  filterWithinBoundary,
} from './integrations/firms/firms.service';
import type { FirmsDetection, FirmsWindow } from './integrations/firms/firms.types';

const log = createLogger('ingest');

export interface IngestResult {
  /** Which FIRMS window the records actually came from — never hidden. */
  window: FirmsWindow;
  perProduct: Record<string, number>;
  fetched: number;
  /** Rejected by the ST_Within Bhopal geofence. */
  outsideBoundary: number;
  duplicates: number;
  created: number;
  failed: number;
  classifiedByModel: number;
  classifiedByRules: number;
  alertsRaised: number;
  byClass: Record<string, number>;
  byRiskLevel: Record<string, number>;
  durationMs: number;
  errors: string[];
}

function emptyResult(window: FirmsWindow): IngestResult {
  return {
    window,
    perProduct: {},
    fetched: 0,
    outsideBoundary: 0,
    duplicates: 0,
    created: 0,
    failed: 0,
    classifiedByModel: 0,
    classifiedByRules: 0,
    alertsRaised: 0,
    byClass: {},
    byRiskLevel: {},
    durationMs: 0,
    errors: [],
  };
}

/**
 * Decides whether a classified detection warrants an alert.
 *
 * Two independent triggers, per the brief:
 *   * risk level HIGH or CRITICAL, or
 *   * a high-confidence industrial classification from the *model* (a rule
 *     fallback never counts as high confidence).
 */
function shouldAlert(
  riskLevel: RiskLevel,
  highConfidenceIndustrial: boolean,
): boolean {
  return riskLevel === 'HIGH' || riskLevel === 'CRITICAL' || highConfidenceIndustrial;
}

function describeAlert(params: {
  thermalClass: ThermalClass;
  riskScore: number;
  riskLevel: RiskLevel;
  persistenceDays: number;
  facilityName: string | null;
  distanceToFacilityM: number | null;
  path: ClassificationPath;
  confidence: number | null;
}): { title: string; message: string } {
  const label = THERMAL_CLASS_LABELS[params.thermalClass];

  const where = params.facilityName
    ? `${params.facilityName}${
        params.distanceToFacilityM != null ? ` (${Math.round(params.distanceToFacilityM)} m away)` : ''
      }`
    : `${PILOT.label}`;

  // Provenance is in the message body, not just the database: an analyst
  // reading only the alert must still be able to tell a model prediction from
  // a degraded-mode rule guess.
  const provenance =
    params.path === 'ML_SERVICE' && params.confidence != null
      ? `Classified by model at ${(params.confidence * 100).toFixed(0)}% confidence.`
      : 'Classified by the rule-based fallback (model unavailable) — treat the class as indicative only.';

  return {
    title: `${params.riskLevel} risk: ${label} near ${params.facilityName ?? PILOT.label}`,
    message:
      `${label} detected near ${where}. ` +
      `Risk score ${params.riskScore}/100 (${params.riskLevel}), ` +
      `detected on ${params.persistenceDays} day(s). ` +
      `${provenance} ` +
      `Decision support only — verify against ground reports before escalation.`,
  };
}

/**
 * Persists a batch of real FIRMS detections through the full pipeline:
 * geofence, geospatial features, classification, risk scoring, alerting.
 *
 * `pushAlerts` is false when replaying an archive backlog, so months-old
 * records do not flood connected dashboards with fake "live" alerts.
 */
export async function ingestDetections(
  detections: FirmsDetection[],
  options: { pushAlerts?: boolean } = {},
): Promise<Omit<IngestResult, 'window' | 'perProduct' | 'fetched' | 'durationMs' | 'errors'>> {
  const pushAlerts = options.pushAlerts ?? true;

  let outsideBoundary = 0;
  let duplicates = 0;
  let created = 0;
  let failed = 0;
  let classifiedByModel = 0;
  let classifiedByRules = 0;
  let alertsRaised = 0;
  const byClass: Record<string, number> = {};
  const byRiskLevel: Record<string, number> = {};

  // Oldest first: persistence and recurrence counting depend on earlier days
  // already being present in the table.
  const ordered = [...detections].sort((a, b) => a.detectedAt.getTime() - b.detectedAt.getTime());

  // One batched ST_Within call for the whole batch rather than one per row.
  // null means no boundary is loaded, which is treated as "unknown" — the rows
  // are still ingested, with inBhopalBoundary left false and a warning logged,
  // because silently discarding everything would empty the dashboard with no
  // visible cause.
  let insideFlags: boolean[] | null = null;
  if (getPostgisStatus().available && ordered.length > 0) {
    try {
      insideFlags = await filterWithinBoundary(ordered, PILOT.label);
      if (insideFlags === null) {
        log.warn(
          `No "${PILOT.label}" boundary polygon is loaded — cannot apply the geofence. ` +
            'Run `npm run db:boundary`. Detections will be stored with inBhopalBoundary=false.',
        );
      }
    } catch (error) {
      log.warn('Batch geofence check failed', {
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  for (const [index, detection] of ordered.entries()) {
    try {
      const existing = await prisma.hotspot.findUnique({
        where: { externalId: detection.externalId },
        select: { id: true },
      });
      if (existing) {
        duplicates += 1;
        continue;
      }

      const inBhopal = insideFlags ? (insideFlags[index] ?? false) : false;
      if (insideFlags && !inBhopal) {
        // Inside the fetch bbox but outside the real district polygon. This is
        // exactly what the polygon geofence exists to catch.
        outsideBoundary += 1;
        continue;
      }

      const features = await computeGeospatialFeatures(
        detection.latitude,
        detection.longitude,
        detection.detectedAt,
      );

      const facility = features.industrialFacilityId
        ? await prisma.industrialFacility.findUnique({
            where: { id: features.industrialFacilityId },
            select: { name: true },
          })
        : null;

      // Nearest populated/critical receptor feeds the 10% risk component.
      const receptor = await findNearestEmergencyFacility(detection.latitude, detection.longitude);

      const signature = {
        brightnessTemperature: detection.brightnessTemperature,
        frp: detection.frp,
        confidence: detection.confidence,
        persistenceDays: features.persistenceDays,
        distanceToFacilityM: features.distanceToFacilityM,
        facilityName: facility?.name ?? null,
        distanceToReceptorM: receptor?.distanceMeters ?? null,
        receptorName: receptor?.name ?? null,
        dayNight: detection.dayNight,
      };

      const classification = await classify(signature, features.recurrenceCount);
      if (classification.path === 'ML_SERVICE') classifiedByModel += 1;
      else classifiedByRules += 1;

      const risk = assessRisk(signature);

      byClass[classification.thermalClass] = (byClass[classification.thermalClass] ?? 0) + 1;
      byRiskLevel[risk.level] = (byRiskLevel[risk.level] ?? 0) + 1;

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
          instrument: detection.instrument,
          firmsProduct: detection.product,
          dayNight: detection.dayNight,
          source: detection.source,
          region: PILOT.label,
          persistenceDays: features.persistenceDays,
          eventType: toEventType(classification.thermalClass),
          mlClass: classification.thermalClass,
          mlConfidence: classification.confidence,
          classificationPath: classification.path,
          classifiedAt: new Date(),
          modelVersion: classification.modelVersion,
          riskScore: risk.score,
          riskLevel: risk.level,
          inBhopalBoundary: inBhopal,
          industrialFacilityId: features.industrialFacilityId,
          distanceToFacilityM: features.distanceToFacilityM,
        },
      });

      created += 1;

      // Immutable audit record of the score the analyst will see.
      await prisma.riskAssessment.create({
        data: {
          hotspotId: hotspot.id,
          score: risk.score,
          level: risk.level,
          reasons: risk.reasons,
          // Cast through unknown: RiskComponents is a closed interface, which
          // Prisma's InputJsonValue (an index-signature type) will not accept
          // directly even though the runtime shape is plain JSON.
          components: risk.components as unknown as Prisma.InputJsonObject,
          weights: risk.weights as unknown as Prisma.InputJsonObject,
          nearestHospitalM: receptor?.type === 'HOSPITAL' ? receptor.distanceMeters : null,
          nearestFireStationM: receptor?.type === 'FIRE_STATION' ? receptor.distanceMeters : null,
          assessedAt: detection.detectedAt,
        },
      });

      const highConfidenceIndustrial = isHighConfidenceIndustrial(classification);

      if (shouldAlert(risk.level, highConfidenceIndustrial)) {
        const { title, message } = describeAlert({
          thermalClass: classification.thermalClass,
          riskScore: risk.score,
          riskLevel: risk.level,
          persistenceDays: features.persistenceDays,
          facilityName: facility?.name ?? null,
          distanceToFacilityM: features.distanceToFacilityM,
          path: classification.path,
          confidence: classification.confidence,
        });

        const alert = await raiseAlertForHotspot({
          hotspotId: hotspot.id,
          title,
          message,
          severity: toAlertSeverity(risk.level),
          reasons: risk.reasons,
          // Anchored to the detection, not wall-clock time, so replaying a
          // backlog produces the same alert timeline live ingestion would.
          referenceTime: detection.detectedAt,
          push: pushAlerts,
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

  return {
    outsideBoundary,
    duplicates,
    created,
    failed,
    classifiedByModel,
    classifiedByRules,
    alertsRaised,
    byClass,
    byRiskLevel,
  };
}

/**
 * One full ingest cycle: fetch real FIRMS data for the Bhopal pilot area, then
 * run it through the pipeline.
 *
 * Never throws. A FIRMS outage, a rejected MAP_KEY or a network failure is
 * reported in the returned result and logged; the API stays up.
 */
export async function runIngestCycle(
  options: {
    bbox?: string;
    dayRange?: number;
    forceArchive?: boolean;
    pushAlerts?: boolean;
  } = {},
): Promise<IngestResult> {
  const startedAt = Date.now();

  let result = emptyResult({
    kind: 'live-nrt',
    description: 'not started',
    products: [],
    dayRange: 0,
  });

  try {
    emitIngestStatus({ phase: 'fetching', startedAt: new Date(startedAt).toISOString() });

    const outcome = await fetchBhopalDetections(options);
    result = emptyResult(outcome.window);
    result.perProduct = outcome.perProduct;
    result.errors = outcome.errors;
    result.fetched = outcome.detections.length;

    log.info('FIRMS fetch complete', {
      window: outcome.window.description,
      kind: outcome.window.kind,
      fetched: result.fetched,
      perProduct: outcome.perProduct,
    });

    emitIngestStatus({ phase: 'persisting', fetched: result.fetched, window: outcome.window });

    // An archive replay is historical, so its alerts are not pushed live.
    const pushAlerts = options.pushAlerts ?? outcome.window.kind === 'live-nrt';

    Object.assign(result, await ingestDetections(outcome.detections, { pushAlerts }));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown ingest error';
    result.errors.push(message);
    log.error('Ingest cycle failed', { error: message });
  }

  result.durationMs = Date.now() - startedAt;

  log.info('Ingest cycle complete', {
    window: result.window.description,
    fetched: result.fetched,
    created: result.created,
    duplicates: result.duplicates,
    outsideBoundary: result.outsideBoundary,
    byModel: result.classifiedByModel,
    byRules: result.classifiedByRules,
    alerts: result.alertsRaised,
    durationMs: result.durationMs,
  });

  emitIngestStatus({ phase: 'complete', result });
  return result;
}

export { THRESHOLDS };
