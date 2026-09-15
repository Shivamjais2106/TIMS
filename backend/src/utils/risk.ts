import { CLASSIFICATION, RISK_BANDS, RISK_WEIGHTS, THRESHOLDS, riskBandFor } from '../config/bhopal';
import type { EventType, RiskLevel, Severity, ThermalClass } from '../generated/prisma/enums';

/**
 * Transparent, rule-based risk scoring.
 *
 * This is NOT a validated probability of fire, and nothing in the UI presents it
 * as one. It is a weighted, fully explainable 0-100 triage score whose weights
 * live in shared/bhopal.config.json and whose drivers are returned alongside it
 * as `reasons`, so an analyst can always see why a number is what it is.
 *
 * Weighting (per the SIH26162 brief, sums to 100):
 *   30  fire radiative power
 *   20  detection confidence
 *   20  persistence / recurrence
 *   20  proximity to an industrial facility
 *   10  proximity to a populated or critical receptor
 */

export interface ThermalSignature {
  /** Brightness temperature in Kelvin. */
  brightnessTemperature: number;
  /** Fire Radiative Power in MW. Null for products that do not report it. */
  frp?: number | null;
  /** Detection confidence normalised to 0-100. */
  confidence: number;
  /** Distinct days this location has been detected. 1 = single pass. */
  persistenceDays: number;
  /** Distance in metres to the nearest known industrial facility. */
  distanceToFacilityM?: number | null;
  /** Name of that facility, used only to phrase the reason string. */
  facilityName?: string | null;
  /** Distance in metres to the nearest populated/critical receptor. */
  distanceToReceptorM?: number | null;
  /** Description of that receptor, e.g. "Hamidia Hospital". */
  receptorName?: string | null;
  /** "D" or "N" - night detections are a stronger industrial indicator. */
  dayNight?: string | null;
}

/** Distance under which a detection is treated as on an industrial site. */
export const INDUSTRIAL_PROXIMITY_M = THRESHOLDS.industrialProximityM;
/** Distance under which a detection is treated as industry-adjacent. */
export const INDUSTRIAL_INFLUENCE_M = THRESHOLDS.industrialInfluenceM;
/** Detections above which a source is continuous rather than episodic. */
export const PERSISTENT_SOURCE_DAYS = THRESHOLDS.persistentSourceDetections;

/**
 * FRP saturation point in MW.
 *
 * 50 MW is a deliberately low ceiling for a 25 km urban pilot box, and it is
 * not a guess: the 434 real FIRMS detections ingested for Bhopal have FRP
 * p90 = 15.4 MW and p99 = 69.9 MW. A 300 MW refinery-scale ceiling would
 * compress every genuine Bhopal detection into the bottom 5% of this component
 * and destroy its ability to discriminate.
 */
const FRP_SATURATION_MW = CLASSIFICATION.frpSaturationMw;

/** Persistence saturation: a source seen on this many days scores full marks. */
const PERSISTENCE_SATURATION_DAYS = CLASSIFICATION.persistenceSaturationDays;

/** Receptor distance at which the populated-proximity component reaches zero. */
const RECEPTOR_INFLUENCE_M = CLASSIFICATION.receptorInfluenceM;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, dp = 1): number {
  const factor = 10 ** dp;
  return Math.round(value * factor) / factor;
}

/** Per-component contribution to the final score, retained for the UI breakdown. */
export interface RiskComponents {
  frp: number;
  confidence: number;
  persistence: number;
  industrialProximity: number;
  populatedProximity: number;
}

export interface RiskResult {
  /** 0-100 triage score. */
  score: number;
  level: RiskLevel;
  /** Human-readable drivers, highest contribution first. */
  reasons: string[];
  components: RiskComponents;
  /** The weight set used, copied so a later config change cannot rewrite history. */
  weights: typeof RISK_WEIGHTS;
}

/**
 * Computes the risk score, its component breakdown and its explanation.
 *
 * Every component is normalised to 0-1 and then multiplied by its configured
 * weight, so the weights in shared/bhopal.config.json are the only place the
 * relative importance of a signal is expressed.
 */
export function assessRisk(signature: ThermalSignature): RiskResult {
  const {
    frp,
    confidence,
    persistenceDays,
    distanceToFacilityM,
    facilityName,
    distanceToReceptorM,
    receptorName,
    brightnessTemperature,
    dayNight,
  } = signature;

  const power = frp ?? 0;

  const normalised = {
    frp: clamp(power / FRP_SATURATION_MW, 0, 1),
    confidence: clamp(confidence / 100, 0, 1),
    persistence: clamp(persistenceDays / PERSISTENCE_SATURATION_DAYS, 0, 1),
    // Full marks on-site, decaying linearly to zero at the influence radius.
    // A null distance means "no facility in the database", which scores zero
    // rather than being treated as far away - those are different statements,
    // but both correctly contribute nothing to industrial risk.
    industrialProximity:
      distanceToFacilityM == null ? 0 : clamp(1 - distanceToFacilityM / INDUSTRIAL_INFLUENCE_M, 0, 1),
    populatedProximity:
      distanceToReceptorM == null ? 0 : clamp(1 - distanceToReceptorM / RECEPTOR_INFLUENCE_M, 0, 1),
  };

  const components: RiskComponents = {
    frp: round(normalised.frp * RISK_WEIGHTS.frp),
    confidence: round(normalised.confidence * RISK_WEIGHTS.confidence),
    persistence: round(normalised.persistence * RISK_WEIGHTS.persistence),
    industrialProximity: round(normalised.industrialProximity * RISK_WEIGHTS.industrialProximity),
    populatedProximity: round(normalised.populatedProximity * RISK_WEIGHTS.populatedProximity),
  };

  const score = round(
    clamp(
      components.frp +
        components.confidence +
        components.persistence +
        components.industrialProximity +
        components.populatedProximity,
      0,
      100,
    ),
  );

  // --- Explanation ----------------------------------------------------------
  // Reasons are ordered by how much each component actually contributed, so the
  // first line an analyst reads is the dominant driver.
  const candidates: Array<{ weight: number; text: string }> = [];

  if (power > 0) {
    const descriptor = normalised.frp >= 0.6 ? 'High' : normalised.frp >= 0.3 ? 'Moderate' : 'Low';
    candidates.push({
      weight: components.frp,
      text: `${descriptor} fire radiative power (${round(power)} MW)`,
    });
  } else {
    candidates.push({ weight: 0, text: 'No radiative power reported by this product' });
  }

  candidates.push({
    weight: components.confidence,
    text: `Detection confidence ${Math.round(confidence)}%`,
  });

  if (persistenceDays >= PERSISTENT_SOURCE_DAYS) {
    candidates.push({
      weight: components.persistence,
      text: `Persistent source - detected on ${persistenceDays} separate days`,
    });
  } else if (persistenceDays > 1) {
    candidates.push({
      weight: components.persistence,
      text: `Repeated detection - seen on ${persistenceDays} days`,
    });
  } else {
    candidates.push({ weight: components.persistence, text: 'Single detection (not yet repeated)' });
  }

  if (distanceToFacilityM != null) {
    const where = facilityName ? ` (${facilityName})` : '';
    if (distanceToFacilityM <= INDUSTRIAL_PROXIMITY_M) {
      candidates.push({
        weight: components.industrialProximity,
        text: `${Math.round(distanceToFacilityM)} m from an industrial facility${where}`,
      });
    } else if (distanceToFacilityM <= INDUSTRIAL_INFLUENCE_M) {
      candidates.push({
        weight: components.industrialProximity,
        text: `Industry-adjacent - ${(distanceToFacilityM / 1000).toFixed(1)} km from a facility${where}`,
      });
    } else {
      candidates.push({
        weight: 0,
        text: `No industrial facility within ${(INDUSTRIAL_INFLUENCE_M / 1000).toFixed(0)} km`,
      });
    }
  } else {
    candidates.push({ weight: 0, text: 'No industrial facility on record nearby' });
  }

  if (distanceToReceptorM != null) {
    const where = receptorName ? ` (${receptorName})` : '';
    candidates.push({
      weight: components.populatedProximity,
      text:
        distanceToReceptorM <= 1_000
          ? `Close to a populated or critical site${where} - ${Math.round(distanceToReceptorM)} m`
          : `Nearest populated or critical site${where} is ${(distanceToReceptorM / 1000).toFixed(1)} km away`,
    });
  }

  // Context that does not score but materially helps an analyst triage.
  const context: string[] = [];
  if (dayNight === 'N') {
    context.push('Night-time detection - less likely to be solar-heated surface');
  }
  if (brightnessTemperature >= 350) {
    context.push(`Very high brightness temperature (${round(brightnessTemperature)} K)`);
  }

  const reasons = [
    ...candidates
      .filter((candidate) => candidate.weight > 0)
      .sort((a, b) => b.weight - a.weight)
      .map((candidate) => candidate.text),
    ...candidates.filter((candidate) => candidate.weight === 0).map((candidate) => candidate.text),
    ...context,
  ];

  return { score, level: riskBandFor(score), reasons, components, weights: RISK_WEIGHTS };
}

/** Buckets a 0-100 risk score into the RiskLevel enum used across the UI. */
export function toRiskLevel(riskScore: number): RiskLevel {
  return riskBandFor(riskScore);
}

/** Alert severity mirrors risk level one-to-one today, but is kept separate. */
export function toAlertSeverity(riskLevel: RiskLevel): Severity {
  return riskLevel;
}

export { RISK_BANDS, RISK_WEIGHTS };

// ---------------------------------------------------------------------------
// Rule-based classification (the fallback when the ML service is unreachable)
// ---------------------------------------------------------------------------

/**
 * Transparent rule-based classification.
 *
 * This is the degraded-mode path. When it runs, the hotspot is recorded with
 * `classificationPath = RULE_FALLBACK` and no confidence value, so the UI can
 * never imply a model prediction that did not happen.
 *
 * Every class name is hedged ("Possible ..."): co-location with a factory is
 * suggestive, not probative, and TIMS does not have ground truth.
 */
export function classifyByRules(signature: ThermalSignature): ThermalClass {
  const { brightnessTemperature, frp, persistenceDays, distanceToFacilityM, dayNight } = signature;

  const power = frp ?? 0;
  const nearFacility = distanceToFacilityM != null && distanceToFacilityM <= INDUSTRIAL_PROXIMITY_M;
  const facilityAdjacent = distanceToFacilityM != null && distanceToFacilityM <= INDUSTRIAL_INFLUENCE_M;
  const isPersistent = persistenceDays >= PERSISTENT_SOURCE_DAYS;
  const isRepeated = persistenceDays > 1;
  const isNight = dayNight === 'N';

  // --- Industrial branches ------------------------------------------------
  // A fixed, continuously-burning source co-located with mapped industry:
  // kiln, furnace, flare. Persistence is what separates this from a one-off.
  if (nearFacility && isPersistent) return 'POSSIBLE_PERSISTENT_THERMAL_SOURCE';

  // Sitting on a plant footprint with a real thermal signal. The FRP floor is
  // the observed median (2.4 MW) rather than a refinery-scale number, because
  // only 20 of 434 real Bhopal detections fall within 1 km of mapped industry
  // at all - requiring 10 MW there would classify almost none of them.
  if (nearFacility && (brightnessTemperature >= CLASSIFICATION.brightnessElevatedK || power >= CLASSIFICATION.frpModerateMw)) {
    return 'POSSIBLE_INDUSTRIAL_FIRE';
  }

  // Industry-adjacent, burning at night, repeatedly. Brick kilns around Bhopal
  // are frequently unmapped in OSM, so a persistent night source near - but
  // not on - a mapped site is still more likely industrial than vegetative.
  if (facilityAdjacent && isNight && isPersistent) return 'POSSIBLE_PERSISTENT_THERMAL_SOURCE';

  // --- Non-industrial branches --------------------------------------------
  // Away from mapped industry. Bhopal district is largely farmland with the
  // Ratapani forest belt to the south-east, so the realistic alternatives are
  // crop-residue burning and vegetation fire.

  // Crop residue: single-pass, daytime, low power. Burns are lit, burn out
  // within hours, and are not re-detected on a later overpass.
  if (!isRepeated && !isNight && power < CLASSIFICATION.frpElevatedMw) {
    return 'POSSIBLE_AGRICULTURAL_BURN';
  }

  // Vegetation fire: either enough radiative power to be a spreading fire, or
  // repeated detection at a location with no industrial explanation.
  if (power >= CLASSIFICATION.frpElevatedMw || isRepeated) return 'POSSIBLE_VEGETATION_FIRE';

  // A weak, single, night-time detection with no industrial context is a
  // genuinely ambiguous signal - possibly a sensor artefact - and is left
  // UNKNOWN rather than guessed at.
  return 'UNKNOWN';
}

/**
 * Maps a hedged ThermalClass onto the legacy EventType enum.
 *
 * EventType predates the classification layer and is still what the analytics
 * aggregations and chart legends key on, so both are maintained. ThermalClass
 * is the value shown to users; EventType is an internal taxonomy.
 */
export function toEventType(thermalClass: ThermalClass): EventType {
  switch (thermalClass) {
    case 'POSSIBLE_INDUSTRIAL_FIRE':
      return 'INDUSTRIAL_FIRE';
    case 'POSSIBLE_PERSISTENT_THERMAL_SOURCE':
      return 'GAS_FLARE';
    case 'POSSIBLE_VEGETATION_FIRE':
      return 'FOREST_FIRE';
    case 'POSSIBLE_AGRICULTURAL_BURN':
      return 'AGRICULTURAL_FIRE';
    default:
      return 'OTHER';
  }
}

/** Human-readable label for a ThermalClass, shared with the frontend. */
export const THERMAL_CLASS_LABELS: Record<ThermalClass, string> = {
  POSSIBLE_INDUSTRIAL_FIRE: 'Possible Industrial Fire',
  POSSIBLE_VEGETATION_FIRE: 'Possible Vegetation Fire',
  POSSIBLE_AGRICULTURAL_BURN: 'Possible Agricultural Burn',
  POSSIBLE_PERSISTENT_THERMAL_SOURCE: 'Possible Persistent Thermal Source',
  UNKNOWN: 'Unknown',
};
