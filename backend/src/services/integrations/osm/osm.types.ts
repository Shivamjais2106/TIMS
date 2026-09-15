import type { EmergencyFacilityType, FacilityType, RiskLevel } from '../../../generated/prisma/enums';

/** An industrial or commercial site, normalised from OSM tagging. */
export interface OsmFacility {
  /** Stable upstream identity, e.g. "way/12345". */
  osmId: string;
  name: string;
  type: FacilityType;
  latitude: number;
  longitude: number;
  location: string;
  riskLevel: RiskLevel;
  operator: string | null;
  /**
   * True when `name` was derived rather than read from a `name` tag.
   *
   * 70 of the 82 industrial elements in the Bhopal pilot bbox are unnamed
   * `landuse=industrial` polygons. They are real industrial zones and matter
   * for the distance-to-facility feature, so they are kept with a derived
   * label - but the UI must be able to say the name is synthesised.
   */
  nameDerived: boolean;
}

/** A response resource or exposed receptor (hospital, fire station, school). */
export interface OsmEmergencyFacility {
  osmId: string;
  name: string;
  type: EmergencyFacilityType;
  latitude: number;
  longitude: number;
  address: string | null;
  capacity: string | null;
  phone: string | null;
  operator: string | null;
  ownership: string | null;
  nameDerived: boolean;
}

export interface OsmFetchParams {
  /** Area of interest as [minLng, minLat, maxLng, maxLat]. */
  bbox: [number, number, number, number];
  limit?: number;
}

export interface OsmProvider {
  readonly name: string;
  readonly isLive: boolean;
  fetchFacilities(params: OsmFetchParams): Promise<OsmFacility[]>;
  fetchEmergencyFacilities(params: OsmFetchParams): Promise<OsmEmergencyFacility[]>;
}
