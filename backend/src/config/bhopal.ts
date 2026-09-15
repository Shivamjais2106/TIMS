// ---------------------------------------------------------------------------
// GENERATED FILE — DO NOT EDIT.
//
// Source:    shared/bhopal.config.json
// Regenerate: npm run sync:config   (from the repository root)
//
// TIMS Bhopal pilot scoping. Every FIRMS fetch, Overpass fetch, PostGIS query
// and Leaflet default reads its geography from here.
// ---------------------------------------------------------------------------

/** Pilot identity, used for the "TIMS / BHOPAL-01" wordmark and report headers. */
export const PILOT = {"id":"BHOPAL-01","label":"Bhopal","state":"Madhya Pradesh","country":"India","timezone":"Asia/Kolkata"} as const;

/**
 * The pilot fetch envelope, exactly as specified in the SIH26162 brief.
 *
 * This is an API-level pre-filter for FIRMS and Overpass. It is NOT the
 * authoritative geofence — a detection only counts as a Bhopal incident once
 * PostGIS ST_Within places it inside BHOPAL_BOUNDARY.
 */
export const BHOPAL_BBOX = {"minLng":77.3,"minLat":23.1,"maxLng":77.55,"maxLat":23.35} as const;

/** Envelope of the full OSM district polygon — swap in to widen the pilot. */
export const BHOPAL_DISTRICT_BBOX = {"minLng":77.1657,"minLat":23.0725,"maxLng":77.6485,"maxLat":23.8954} as const;

/** Provenance of the authoritative geofence polygon. */
export const BHOPAL_BOUNDARY = {"file":"bhopal-boundary.geojson","osmType":"relation","osmId":1976080,"adminLevel":"district","source":"OpenStreetMap via Nominatim","sourceUrl":"https://www.openstreetmap.org/relation/1976080","license":"ODbL 1.0","attribution":"© OpenStreetMap contributors","retrievedAt":"2026-09-15","vertices":7217} as const;

/** Leaflet defaults: centre, zoom and clamps. */
export const MAP_DEFAULTS = {"center":[23.225,77.425],"zoom":12,"minZoom":9,"maxZoom":18,"boundsPadding":0.02} as const;

/** Named thresholds for the risk engine and the ML weak-labeller. */
export const THRESHOLDS = {"industrialProximityM":1000,"industrialInfluenceM":3000,"persistentSourceDetections":3,"persistenceRadiusM":1000,"persistenceLookbackDays":30,"impactZonesKm":[1,3,5],"highConfidenceMlThreshold":0.75} as const;

/**
 * Classification thresholds, derived from the observed distribution of real
 * FIRMS detections for this pilot area rather than chosen a priori.
 */
export const CLASSIFICATION = {"frpSaturationMw":50,"frpModerateMw":2.4,"frpElevatedMw":7.7,"frpHighMw":15.4,"brightnessElevatedK":318,"brightnessHighK":351,"persistenceSaturationDays":7,"receptorInfluenceM":3000} as const;

/** Rule-based risk scoring weights. Sum to 100. */
export const RISK_WEIGHTS = {"frp":30,"confidence":20,"persistence":20,"industrialProximity":20,"populatedProximity":10} as const;

/** Inclusive lower bound of each risk band. */
export const RISK_BANDS = {"LOW":0,"MEDIUM":31,"HIGH":61,"CRITICAL":81} as const;

/** FIRMS product and day-range limits, verified against the live API. */
export const FIRMS_LIMITS = {"maxDayRange":5,"nrtProducts":["VIIRS_SNPP_NRT","VIIRS_NOAA20_NRT","MODIS_NRT"],"archiveProducts":["VIIRS_SNPP_SP","VIIRS_NOAA20_SP","MODIS_SP"],"archiveSeasons":[{"from":"2026-02-01","to":"2026-04-27","label":"2026 fire season"},{"from":"2025-02-01","to":"2025-05-31","label":"2025 fire season"},{"from":"2025-10-01","to":"2025-11-30","label":"2025 kharif residue window"},{"from":"2024-02-01","to":"2024-05-31","label":"2024 fire season"},{"from":"2024-10-01","to":"2024-11-30","label":"2024 kharif residue window"}]} as const;

/** FIRMS `area` parameter form: "minLng,minLat,maxLng,maxLat". */
export const BHOPAL_BBOX_PARAM =
  `${BHOPAL_BBOX.minLng},${BHOPAL_BBOX.minLat},${BHOPAL_BBOX.maxLng},${BHOPAL_BBOX.maxLat}`;

/** Leaflet `bounds` form: [[south, west], [north, east]], lightly padded. */
export const BHOPAL_BOUNDS: [[number, number], [number, number]] = [
  [BHOPAL_BBOX.minLat - MAP_DEFAULTS.boundsPadding, BHOPAL_BBOX.minLng - MAP_DEFAULTS.boundsPadding],
  [BHOPAL_BBOX.maxLat + MAP_DEFAULTS.boundsPadding, BHOPAL_BBOX.maxLng + MAP_DEFAULTS.boundsPadding],
];

/** Cheap bbox containment test. Use the PostGIS polygon check for anything authoritative. */
export function isInBhopalBbox(latitude: number, longitude: number): boolean {
  return (
    latitude >= BHOPAL_BBOX.minLat &&
    latitude <= BHOPAL_BBOX.maxLat &&
    longitude >= BHOPAL_BBOX.minLng &&
    longitude <= BHOPAL_BBOX.maxLng
  );
}

/** Buckets a 0-100 risk score using RISK_BANDS. */
export function riskBandFor(score: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
  if (score >= RISK_BANDS.CRITICAL) return 'CRITICAL';
  if (score >= RISK_BANDS.HIGH) return 'HIGH';
  if (score >= RISK_BANDS.MEDIUM) return 'MEDIUM';
  return 'LOW';
}
