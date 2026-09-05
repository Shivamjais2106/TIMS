import type { FacilityType, RiskLevel } from '../../../generated/prisma/enums';

/**
 * Provider-neutral representation of an industrial facility.
 *
 * Both the seeded mock provider and the future Overpass provider emit this
 * shape, so `osm.service.ts` never needs to know which one produced it.
 */
export interface OsmFacility {
  /** Stable upstream identity, e.g. "way/123456789". Used for idempotent upserts. */
  osmId: string;
  name: string;
  type: FacilityType;
  latitude: number;
  longitude: number;
  location: string;
  riskLevel: RiskLevel;
  operator?: string | null;
}

export interface OsmFetchParams {
  /** Area of interest as [minLon, minLat, maxLon, maxLat]. */
  bbox: [number, number, number, number];
  /** Cap on returned elements. */
  limit?: number;
}

export interface OsmProvider {
  readonly name: string;
  /** True when the provider is talking to the real Overpass API. */
  readonly isLive: boolean;
  fetchFacilities(params: OsmFetchParams): Promise<OsmFacility[]>;
}
