import type { HotspotSource } from '../../../generated/prisma/enums';

/**
 * One thermal anomaly as delivered by a FIRMS product, already normalised.
 *
 * FIRMS itself is inconsistent across products (MODIS reports `brightness` and
 * a numeric confidence; VIIRS reports `bright_ti4` and low/nominal/high), so
 * every provider is responsible for producing this uniform shape.
 */
export interface FirmsDetection {
  /** Deterministic identity: satellite + acquisition time + rounded coordinates. */
  externalId: string;
  latitude: number;
  longitude: number;
  /** Acquisition timestamp in UTC. */
  detectedAt: Date;
  /** Normalised to 0-100 for every product. */
  confidence: number;
  /** Brightness temperature in Kelvin. */
  brightnessTemperature: number;
  /** Fire Radiative Power in MW. */
  frp: number | null;
  satellite: string;
  /** "D" for a daytime overpass, "N" for night. */
  dayNight: 'D' | 'N';
  source: HotspotSource;
}

export interface FirmsFetchParams {
  /** Area of interest as [minLon, minLat, maxLon, maxLat]. */
  bbox: [number, number, number, number];
  /** How many days back to request (FIRMS allows 1-10). */
  dayRange: number;
  /** FIRMS product, e.g. VIIRS_SNPP_NRT. */
  source: string;
}

export interface FirmsProvider {
  readonly name: string;
  /** True when the provider is calling the real NASA FIRMS API. */
  readonly isLive: boolean;
  fetchDetections(params: FirmsFetchParams): Promise<FirmsDetection[]>;
}
