import type { EventType, RiskLevel, Severity } from '../generated/prisma/enums';

/**
 * Deterministic, rule-based classification and risk scoring.
 *
 * This is the *interim* implementation. When the Python AI/ML service lands it
 * will expose the same contract (`classifyEventType` / `computeRiskScore`) over
 * HTTP, and `hotspot.service.ts` will call that instead. Keeping the signatures
 * narrow — plain numbers in, plain values out — is what makes that swap cheap.
 */

export interface ThermalSignature {
  /** Brightness temperature in Kelvin. */
  brightnessTemperature: number;
  /** Fire Radiative Power in MW. Undefined for products that do not report it. */
  frp?: number | null;
  /** Detection confidence normalised to 0-100. */
  confidence: number;
  /** Consecutive days the same location has been detected. */
  persistenceDays: number;
  /** Distance in metres to the nearest known industrial facility, if any. */
  distanceToFacilityM?: number | null;
  /** "D" or "N" — night detections are a strong flare/industrial indicator. */
  dayNight?: string | null;
}

/** Distance under which a detection is considered "on" an industrial site. */
export const INDUSTRIAL_PROXIMITY_M = 2_000;
/** Distance under which a detection is considered industry-adjacent. */
export const INDUSTRIAL_INFLUENCE_M = 5_000;
/** Persistence above which a source is treated as continuous rather than episodic. */
export const PERSISTENT_SOURCE_DAYS = 3;

/**
 * Rule-based event classification.
 *
 * The signal ordering mirrors the published FIRMS/VIIRS flare-detection
 * literature: very hot + very persistent + co-located with a plant is a gas
 * flare; hot + short-lived + co-located is an industrial fire; everything else
 * falls back to land-cover style heuristics.
 */
export function classifyEventType(signature: ThermalSignature): EventType {
  const { brightnessTemperature, frp, persistenceDays, distanceToFacilityM, dayNight } = signature;

  const nearFacility = distanceToFacilityM != null && distanceToFacilityM <= INDUSTRIAL_PROXIMITY_M;
  const facilityAdjacent = distanceToFacilityM != null && distanceToFacilityM <= INDUSTRIAL_INFLUENCE_M;
  const isNight = dayNight === 'N';
  const power = frp ?? 0;

  // Gas flares burn continuously at very high temperature in a fixed location.
  if (nearFacility && persistenceDays >= PERSISTENT_SOURCE_DAYS && brightnessTemperature >= 340) {
    return 'GAS_FLARE';
  }

  // A hot, high-power detection sitting on a plant footprint.
  if (nearFacility && (brightnessTemperature >= 330 || power >= 20)) {
    return 'INDUSTRIAL_FIRE';
  }

  // Persistent night-time heat close to industry, but cooler: kilns, smelters,
  // flare pilots. The power floor keeps smouldering coal seams out of this
  // branch so they can fall through to MINING_ACTIVITY below.
  if (facilityAdjacent && isNight && persistenceDays >= PERSISTENT_SOURCE_DAYS && power >= 15) {
    return 'INDUSTRIAL_FIRE';
  }

  // Open-cast mining: moderate, recurring daytime heat away from settlements.
  if (persistenceDays >= PERSISTENT_SOURCE_DAYS && brightnessTemperature < 330 && power < 15) {
    return 'MINING_ACTIVITY';
  }

  // Stubble burning: short-lived, low power, daytime.
  if (persistenceDays <= 1 && power < 10 && brightnessTemperature < 330 && !isNight) {
    return 'AGRICULTURAL_FIRE';
  }

  // Wildfire: high power, spreading, not tied to a facility.
  if (power >= 25 && !facilityAdjacent) {
    return 'FOREST_FIRE';
  }

  return 'OTHER';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Composite 0-100 risk score.
 *
 * Weighting: thermal intensity 30, radiative power 20, persistence 20,
 * industrial proximity 20, detection confidence 10.
 */
export function computeRiskScore(signature: ThermalSignature, eventType: EventType): number {
  const { brightnessTemperature, frp, confidence, persistenceDays, distanceToFacilityM } = signature;

  // Thermal intensity: 300 K -> 0, 400 K -> full marks.
  const thermal = clamp((brightnessTemperature - 300) / 100, 0, 1) * 30;

  // Radiative power saturates at 100 MW.
  const power = clamp((frp ?? 0) / 100, 0, 1) * 20;

  // Persistence saturates at two weeks.
  const persistence = clamp(persistenceDays / 14, 0, 1) * 20;

  // Proximity: full marks on-site, decaying to zero at the influence radius.
  const proximity =
    distanceToFacilityM == null
      ? 0
      : clamp(1 - distanceToFacilityM / INDUSTRIAL_INFLUENCE_M, 0, 1) * 20;

  const certainty = clamp(confidence / 100, 0, 1) * 10;

  // Industrial event types carry more downstream consequence (population,
  // hazardous inventory, statutory reporting) so they are weighted up.
  const typeMultiplier: Record<EventType, number> = {
    INDUSTRIAL_FIRE: 1.15,
    GAS_FLARE: 1.05,
    MINING_ACTIVITY: 0.95,
    FOREST_FIRE: 0.9,
    AGRICULTURAL_FIRE: 0.75,
    OTHER: 0.85,
  };

  const raw = (thermal + power + persistence + proximity + certainty) * typeMultiplier[eventType];
  return Math.round(clamp(raw, 0, 100) * 10) / 10;
}

/** Buckets a 0-100 risk score into the RiskLevel enum used across the UI. */
export function toRiskLevel(riskScore: number): RiskLevel {
  if (riskScore >= 80) return 'CRITICAL';
  if (riskScore >= 60) return 'HIGH';
  if (riskScore >= 35) return 'MEDIUM';
  return 'LOW';
}

/** Alert severity mirrors risk level one-to-one today, but is kept separate. */
export function toAlertSeverity(riskLevel: RiskLevel): Severity {
  return riskLevel;
}

/** Convenience wrapper: classify, score and bucket in one call. */
export function assessHotspot(signature: ThermalSignature): {
  eventType: EventType;
  riskScore: number;
  riskLevel: RiskLevel;
} {
  const eventType = classifyEventType(signature);
  const riskScore = computeRiskScore(signature, eventType);
  return { eventType, riskScore, riskLevel: toRiskLevel(riskScore) };
}
