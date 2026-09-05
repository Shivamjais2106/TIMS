import { MOCK_FACILITIES } from '../osm/osm.mock';
import type { FacilityType } from '../../../generated/prisma/enums';
import type { FirmsDetection, FirmsFetchParams, FirmsProvider } from './firms.types';

/**
 * Deterministic pseudo-random generator.
 *
 * A fixed seed means the same run produces the same detections, so screenshots,
 * demo scripts and chart snapshots stay reproducible between restarts.
 */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

/**
 * Thermal signature per facility class.
 *
 * These ranges are chosen so the rule-based classifier in utils/risk.ts sees a
 * realistic spread: flare stacks run hottest, coal-seam fires smoulder coolest,
 * and furnaces sit in between. Without this separation every industrial site
 * would classify identically.
 */
interface EmissionProfile {
  /** Probability a given site is detected on a given day. */
  rate: number;
  tempMin: number;
  tempRange: number;
  frpMin: number;
  frpRange: number;
}

const EMISSION_PROFILES: Record<FacilityType, EmissionProfile> = {
  REFINERY: { rate: 0.88, tempMin: 345, tempRange: 27, frpMin: 30, frpRange: 80 },
  PETROCHEMICAL: { rate: 0.85, tempMin: 344, tempRange: 26, frpMin: 28, frpRange: 75 },
  LNG_TERMINAL: { rate: 0.8, tempMin: 342, tempRange: 24, frpMin: 25, frpRange: 65 },
  STEEL: { rate: 0.7, tempMin: 328, tempRange: 11, frpMin: 20, frpRange: 50 },
  POWER_PLANT: { rate: 0.55, tempMin: 324, tempRange: 12, frpMin: 18, frpRange: 37 },
  MINING: { rate: 0.75, tempMin: 311, tempRange: 15, frpMin: 4, frpRange: 9 },
  OTHER: { rate: 0.4, tempMin: 322, tempRange: 12, frpMin: 8, frpRange: 22 },
};

/** Vegetation / agriculture belts that produce seasonal non-industrial fires. */
const RURAL_CLUSTERS = [
  { name: 'Punjab paddy belt', lat: 30.6, lon: 75.5, spreadDeg: 1.1, profile: 'agricultural' as const },
  { name: 'Haryana stubble belt', lat: 29.4, lon: 76.4, spreadDeg: 0.9, profile: 'agricultural' as const },
  { name: 'Central Indian forest', lat: 21.8, lon: 79.6, spreadDeg: 1.6, profile: 'forest' as const },
  { name: 'Western Ghats', lat: 13.5, lon: 75.3, spreadDeg: 1.3, profile: 'forest' as const },
  { name: 'Eastern Ghats', lat: 18.8, lon: 82.9, spreadDeg: 1.4, profile: 'forest' as const },
];

function inBbox(lat: number, lon: number, bbox: [number, number, number, number]): boolean {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  return lon >= minLon && lon <= maxLon && lat >= minLat && lat <= maxLat;
}

function buildExternalId(satellite: string, detectedAt: Date, lat: number, lon: number): string {
  return `${satellite}:${detectedAt.toISOString()}:${lat.toFixed(4)}:${lon.toFixed(4)}`;
}

/**
 * Generates a realistic FIRMS-like feed without any network access or API key.
 *
 * Detections are drawn from two populations that mirror what VIIRS actually
 * sees over India:
 *   1. Tight, hot, persistent clusters sitting on the known industrial sites
 *      in MOCK_FACILITIES (flares, furnaces, coal-seam fires).
 *   2. Diffuse, cooler, short-lived detections over agricultural and forest
 *      belts.
 *
 * That mix is what makes the classifier in utils/risk.ts produce a believable
 * spread of event types instead of a single blob.
 */
export class MockFirmsProvider implements FirmsProvider {
  readonly name = 'firms-mock';
  readonly isLive = false;

  constructor(private readonly seed = 20260101) {}

  async fetchDetections(params: FirmsFetchParams): Promise<FirmsDetection[]> {
    return this.generate(params, params.dayRange);
  }

  /**
   * Exposed separately from `fetchDetections` so the database seeder can ask
   * for a long history (e.g. 45 days) without pretending FIRMS would serve it.
   */
  generate(params: FirmsFetchParams, days: number, seedOffset = 0): FirmsDetection[] {
    const random = createRandom(this.seed + seedOffset);
    const detections: FirmsDetection[] = [];
    const now = Date.now();
    const satellites = ['N', 'N20', 'N21'];

    for (let dayOffset = days - 1; dayOffset >= 0; dayOffset -= 1) {
      const dayStart = now - dayOffset * 86_400_000;

      // --- Industrial population -------------------------------------------
      for (const facility of MOCK_FACILITIES) {
        if (!inBbox(facility.latitude, facility.longitude, params.bbox)) continue;

        const profile = EMISSION_PROFILES[facility.type];
        if (random() > profile.rate) continue;

        const passes = 1 + Math.floor(random() * 2);
        for (let pass = 0; pass < passes; pass += 1) {
          // Detections land within roughly 1.5 km of the plant footprint, which
          // is the geolocation accuracy of a 375 m VIIRS pixel.
          const jitterLat = (random() - 0.5) * 0.03;
          const jitterLon = (random() - 0.5) * 0.03;
          const isNight = random() > 0.4;

          const satellite = satellites[Math.floor(random() * satellites.length)] ?? 'N';
          const detectedAt = new Date(dayStart - Math.floor(random() * 86_400_000));
          const latitude = Number((facility.latitude + jitterLat).toFixed(5));
          const longitude = Number((facility.longitude + jitterLon).toFixed(5));

          detections.push({
            externalId: buildExternalId(satellite, detectedAt, latitude, longitude),
            latitude,
            longitude,
            detectedAt,
            confidence: 70 + Math.floor(random() * 30),
            brightnessTemperature: Number((profile.tempMin + random() * profile.tempRange).toFixed(2)),
            frp: Number((profile.frpMin + random() * profile.frpRange).toFixed(2)),
            satellite,
            dayNight: isNight ? 'N' : 'D',
            source: 'VIIRS_SNPP_NRT',
          });
        }
      }

      // --- Vegetation population -------------------------------------------
      for (const cluster of RURAL_CLUSTERS) {
        const count = cluster.profile === 'agricultural' ? 3 + Math.floor(random() * 6) : 1 + Math.floor(random() * 4);

        for (let index = 0; index < count; index += 1) {
          const latitude = Number((cluster.lat + (random() - 0.5) * cluster.spreadDeg).toFixed(5));
          const longitude = Number((cluster.lon + (random() - 0.5) * cluster.spreadDeg).toFixed(5));
          if (!inBbox(latitude, longitude, params.bbox)) continue;

          const satellite = satellites[Math.floor(random() * satellites.length)] ?? 'N';
          const detectedAt = new Date(dayStart - Math.floor(random() * 86_400_000));
          const isForest = cluster.profile === 'forest';

          detections.push({
            externalId: buildExternalId(satellite, detectedAt, latitude, longitude),
            latitude,
            longitude,
            detectedAt,
            confidence: isForest ? 55 + Math.floor(random() * 40) : 40 + Math.floor(random() * 45),
            brightnessTemperature: Number(((isForest ? 318 : 308) + random() * 18).toFixed(2)),
            frp: Number(((isForest ? 20 : 3) + random() * (isForest ? 45 : 9)).toFixed(2)),
            satellite,
            dayNight: random() > 0.75 ? 'N' : 'D',
            source: 'VIIRS_SNPP_NRT',
          });
        }
      }
    }

    // De-duplicate on externalId, exactly as the real ingest path does.
    const unique = new Map<string, FirmsDetection>();
    for (const detection of detections) unique.set(detection.externalId, detection);
    return [...unique.values()].sort((a, b) => b.detectedAt.getTime() - a.detectedAt.getTime());
  }
}
