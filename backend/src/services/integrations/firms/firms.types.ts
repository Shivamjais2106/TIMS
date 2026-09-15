import type { HotspotSource } from '../../../generated/prisma/enums';

/**
 * One thermal anomaly as delivered by a FIRMS product, already normalised.
 *
 * FIRMS is inconsistent across products (MODIS reports `brightness` and a
 * numeric confidence; VIIRS reports `bright_ti4` and low/nominal/high), so
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
  /** FIRMS `instrument` column: "VIIRS" or "MODIS". */
  instrument: string | null;
  /** "D" for a daytime overpass, "N" for night. */
  dayNight: 'D' | 'N';
  source: HotspotSource;
  /** The FIRMS product this row came from, e.g. "VIIRS_SNPP_SP". */
  product: string;
}

/**
 * A single FIRMS area request.
 *
 * FIRMS exposes two URL shapes off the same endpoint:
 *   .../area/csv/{key}/{product}/{area}/{dayRange}            → trailing window
 *   .../area/csv/{key}/{product}/{area}/{dayRange}/{startDate} → archive window
 *
 * `startDate` selects the second form, which is how the archive fallback reads
 * a historical fire season.
 */
export interface FirmsFetchParams {
  /** Area of interest as [minLng, minLat, maxLng, maxLat]. */
  bbox: [number, number, number, number];
  /** How many days to request. FIRMS hard-limits this to 1..5. */
  dayRange: number;
  /** FIRMS product, e.g. VIIRS_SNPP_NRT or VIIRS_SNPP_SP. */
  product: string;
  /** Archive start date as YYYY-MM-DD. Omit for the trailing NRT window. */
  startDate?: string;
}

/** Which window a batch of detections actually came from — always logged. */
export type FirmsWindowKind = 'live-nrt' | 'archive';

export interface FirmsWindow {
  kind: FirmsWindowKind;
  /** Human-readable description for logs and the UI provenance banner. */
  description: string;
  products: string[];
  /** Present for archive windows. */
  from?: string;
  to?: string;
  dayRange: number;
  /** Which seasons the archive sweep actually covered, for the UI provenance note. */
  seasons?: string[];
}

export interface FirmsProvider {
  readonly name: string;
  /** True when the provider is calling the real NASA FIRMS API. */
  readonly isLive: boolean;
  fetchDetections(params: FirmsFetchParams): Promise<FirmsDetection[]>;
}
