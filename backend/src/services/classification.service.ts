import { THRESHOLDS } from '../config/bhopal';
import { env } from '../config/env';
import type { ClassificationPath, ThermalClass } from '../generated/prisma/enums';
import { createLogger } from '../utils/logger';
import { classifyByRules, type ThermalSignature } from '../utils/risk';

const log = createLogger('classify');

/**
 * Adapter in front of the Python/XGBoost classification service.
 *
 * Two rules govern this file:
 *
 *   1. The ML model is never replaced by something that pretends to be it. When
 *      the FastAPI service is unreachable we fall back to the transparent rule
 *      engine, and the result carries `path = RULE_FALLBACK` with a null
 *      confidence, all the way through to the UI.
 *   2. The feature contract is narrow and explicit, so the model can be
 *      retrained or swapped without touching the ingest pipeline.
 */

/** The exact feature vector the trained model expects, in order. */
export interface ClassificationFeatures {
  brightness: number;
  frp: number;
  /** Metres to nearest industrial facility. The model is trained on a sentinel
   *  for "no facility", so null is converted before the call. */
  distance_to_facility_m: number;
  recurrence_count: number;
  /** 1 for a night overpass, 0 for day. */
  is_night: number;
}

export interface ClassificationResult {
  thermalClass: ThermalClass;
  /** 0-1. Null whenever the rule fallback produced the class. */
  confidence: number | null;
  path: ClassificationPath;
  modelVersion: string | null;
  /** Full per-class probability vector, when the service supplies one. */
  probabilities?: Record<string, number> | null;
}

/**
 * Sentinel distance for "no industrial facility on record".
 *
 * The model is trained with this same value (see ml/train_model.py), so the
 * two must stay in step. A large finite number rather than NaN, because tree
 * ensembles split on it cleanly and it orders correctly against real distances.
 */
export const NO_FACILITY_DISTANCE_M = 50_000;

/** Health of the ML service, cached so every ingest row does not re-probe it. */
interface ServiceHealth {
  reachable: boolean;
  modelVersion: string | null;
  checkedAt: number;
  reason?: string;
}

let health: ServiceHealth = { reachable: false, modelVersion: null, checkedAt: 0 };

/** How long a health verdict is trusted before re-probing. */
const HEALTH_TTL_MS = 30_000;

export function getMlServiceHealth(): Omit<ServiceHealth, 'checkedAt'> & { checkedAt: string | null } {
  return {
    reachable: health.reachable,
    modelVersion: health.modelVersion,
    reason: health.reason,
    checkedAt: health.checkedAt === 0 ? null : new Date(health.checkedAt).toISOString(),
  };
}

/** Probes GET /health, respecting the cache TTL. */
export async function checkMlService(force = false): Promise<boolean> {
  if (!env.ML_SERVICE_ENABLED) {
    health = { reachable: false, modelVersion: null, checkedAt: Date.now(), reason: 'ML_SERVICE_ENABLED=false' };
    return false;
  }
  if (!force && Date.now() - health.checkedAt < HEALTH_TTL_MS) return health.reachable;

  try {
    const response = await fetch(`${env.ML_SERVICE_URL}/health`, {
      signal: AbortSignal.timeout(env.ML_SERVICE_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const payload = (await response.json()) as { status?: string; model_version?: string; model_loaded?: boolean };
    const reachable = payload.status === 'ok' && payload.model_loaded !== false;

    health = {
      reachable,
      modelVersion: payload.model_version ?? null,
      checkedAt: Date.now(),
      reason: reachable ? undefined : 'Service responded but reports no loaded model',
    };
  } catch (error) {
    health = {
      reachable: false,
      modelVersion: null,
      checkedAt: Date.now(),
      reason: error instanceof Error ? error.message : 'Unknown error',
    };
  }

  return health.reachable;
}

/** Builds the model's feature vector from a thermal signature. */
export function toFeatures(signature: ThermalSignature, recurrenceCount: number): ClassificationFeatures {
  return {
    brightness: signature.brightnessTemperature,
    frp: signature.frp ?? 0,
    distance_to_facility_m: signature.distanceToFacilityM ?? NO_FACILITY_DISTANCE_M,
    recurrence_count: recurrenceCount,
    is_night: signature.dayNight === 'N' ? 1 : 0,
  };
}

function ruleFallback(signature: ThermalSignature, reason: string): ClassificationResult {
  return {
    thermalClass: classifyByRules(signature),
    // Explicitly null: the rule engine has no calibrated confidence, and
    // inventing one would misrepresent a heuristic as a model output.
    confidence: null,
    path: 'RULE_FALLBACK',
    modelVersion: null,
    probabilities: null,
  };
}

/**
 * Classifies one detection.
 *
 * Calls POST /predict on the FastAPI service; on any failure - disabled,
 * unreachable, timeout, malformed response, unknown class - falls back to the
 * rule engine and logs which path was taken. This function never throws, so a
 * dead ML container can never stall or crash an ingest cycle.
 */
export async function classify(
  signature: ThermalSignature,
  recurrenceCount: number,
): Promise<ClassificationResult> {
  if (!env.ML_SERVICE_ENABLED) {
    return ruleFallback(signature, 'ML_SERVICE_ENABLED=false');
  }

  const reachable = await checkMlService();
  if (!reachable) {
    return ruleFallback(signature, health.reason ?? 'unreachable');
  }

  const features = toFeatures(signature, recurrenceCount);

  try {
    const response = await fetch(`${env.ML_SERVICE_URL}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(features),
      signal: AbortSignal.timeout(env.ML_SERVICE_TIMEOUT_MS),
    });

    if (!response.ok) throw new Error(`predict returned HTTP ${response.status}`);

    const payload = (await response.json()) as {
      thermal_class?: string;
      confidence?: number;
      model_version?: string;
      probabilities?: Record<string, number>;
    };

    const thermalClass = payload.thermal_class as ThermalClass | undefined;
    const known: ThermalClass[] = [
      'POSSIBLE_INDUSTRIAL_FIRE',
      'POSSIBLE_VEGETATION_FIRE',
      'POSSIBLE_AGRICULTURAL_BURN',
      'POSSIBLE_PERSISTENT_THERMAL_SOURCE',
      'UNKNOWN',
    ];

    if (!thermalClass || !known.includes(thermalClass)) {
      throw new Error(`predict returned an unrecognised class: ${String(payload.thermal_class)}`);
    }

    return {
      thermalClass,
      confidence:
        typeof payload.confidence === 'number' && Number.isFinite(payload.confidence)
          ? payload.confidence
          : null,
      path: 'ML_SERVICE',
      modelVersion: payload.model_version ?? health.modelVersion,
      probabilities: payload.probabilities ?? null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.warn('ML predict failed - using the rule-based fallback', { error: message });
    // Force a re-probe next time rather than trusting a stale "reachable".
    health = { ...health, reachable: false, checkedAt: 0, reason: message };
    return ruleFallback(signature, message);
  }
}

/**
 * True when a classification is confident enough to act on without review.
 *
 * A rule-fallback result is never "high confidence", regardless of the class,
 * because there is no calibrated probability behind it.
 */
export function isHighConfidenceIndustrial(result: ClassificationResult): boolean {
  if (result.path !== 'ML_SERVICE' || result.confidence == null) return false;
  const industrial: ThermalClass[] = ['POSSIBLE_INDUSTRIAL_FIRE', 'POSSIBLE_PERSISTENT_THERMAL_SOURCE'];
  return industrial.includes(result.thermalClass) && result.confidence >= THRESHOLDS.highConfidenceMlThreshold;
}
