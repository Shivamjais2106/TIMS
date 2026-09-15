/**
 * Shared domain types.
 *
 * These mirror the Prisma models exposed by the TIMS API. They are declared by
 * hand rather than generated so the frontend can be built against the contract
 * without pulling the backend's Prisma client into its dependency tree.
 */

export type Role = 'ADMIN' | 'ANALYST' | 'VIEWER';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type Severity = RiskLevel;

/**
 * Classification output. Every value is hedged: TIMS reports what a thermal
 * signature is *consistent with*, never an adjudicated fact.
 */
export type ThermalClass =
  | 'POSSIBLE_INDUSTRIAL_FIRE'
  | 'POSSIBLE_VEGETATION_FIRE'
  | 'POSSIBLE_AGRICULTURAL_BURN'
  | 'POSSIBLE_PERSISTENT_THERMAL_SOURCE'
  | 'UNKNOWN';

/** Which code path produced a classification. Always shown to the analyst. */
export type ClassificationPath = 'ML_SERVICE' | 'RULE_FALLBACK' | 'UNCLASSIFIED';

/** Legacy internal taxonomy, retained for the analytics aggregations. */
export type EventType =
  | 'INDUSTRIAL_FIRE'
  | 'GAS_FLARE'
  | 'AGRICULTURAL_FIRE'
  | 'FOREST_FIRE'
  | 'MINING_ACTIVITY'
  | 'OTHER';

export type FacilityType =
  | 'REFINERY'
  | 'PETROCHEMICAL'
  | 'POWER_PLANT'
  | 'STEEL'
  | 'MINING'
  | 'LNG_TERMINAL'
  | 'OTHER';

export type EmergencyFacilityType =
  | 'HOSPITAL'
  | 'FIRE_STATION'
  | 'SCHOOL'
  | 'POLICE'
  | 'SHELTER'
  | 'WATER_SOURCE';

export type AlertStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | 'DISMISSED';

export type DataSourceStatus = 'LIVE' | 'CREDENTIALS_REQUIRED' | 'UNAVAILABLE' | 'DEMO';

export type ReportStatus = 'QUEUED' | 'READY' | 'FAILED';

export type HotspotSource =
  | 'VIIRS_SNPP_NRT'
  | 'VIIRS_NOAA20_NRT'
  | 'MODIS_NRT'
  | 'LANDSAT_NRT'
  | 'MANUAL'
  | 'MOCK';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResult {
  user: User;
  token: string;
  expiresIn: string;
}

export interface FacilityRef {
  id: string;
  name: string;
  type: FacilityType;
  location: string;
  latitude?: number;
  longitude?: number;
  riskLevel?: RiskLevel;
}

export interface Hotspot {
  id: string;
  latitude: number;
  longitude: number;
  detectedAt: string;
  confidence: number;
  brightnessTemperature: number;
  eventType: EventType;
  persistenceDays: number;
  riskScore: number;
  riskLevel: RiskLevel;
  source: HotspotSource;
  frp: number | null;
  satellite: string | null;
  instrument: string | null;
  /** Exact FIRMS product, e.g. "VIIRS_SNPP_SP". `_SP` means archive, not NRT. */
  firmsProduct: string | null;
  dayNight: string | null;
  region: string | null;
  externalId: string | null;

  // --- Classification -------------------------------------------------------
  mlClass: ThermalClass | null;
  /** 0-1. Null whenever the class came from the rule fallback. */
  mlConfidence: number | null;
  classificationPath: ClassificationPath;
  classifiedAt: string | null;
  modelVersion: string | null;

  /** True when PostGIS ST_Within placed this inside the Bhopal district polygon. */
  inBhopalBoundary: boolean;

  industrialFacilityId: string | null;
  industrialFacility: FacilityRef | null;
  distanceToFacilityM: number | null;

  createdAt: string;
  updatedAt: string;
}

export interface RiskComponents {
  frp: number;
  confidence: number;
  persistence: number;
  industrialProximity: number;
  populatedProximity: number;
}

export interface RiskAssessment {
  score: number;
  level: RiskLevel;
  /** Human-readable drivers, highest contribution first. */
  reasons: string[];
  components: RiskComponents;
  weights: Record<string, number>;
  nearestHospitalM?: number | null;
  nearestFireStationM?: number | null;
  assessedAt: string;
}

export interface IndustrialFacility {
  id: string;
  name: string;
  type: FacilityType;
  latitude: number;
  longitude: number;
  location: string;
  riskLevel: RiskLevel;
  operator: string | null;
  osmId: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { hotspots: number };
}

export interface FacilityDetail extends IndustrialFacility {
  hotspots: Array<
    Pick<
      Hotspot,
      | 'id'
      | 'latitude'
      | 'longitude'
      | 'detectedAt'
      | 'mlClass'
      | 'riskLevel'
      | 'riskScore'
      | 'confidence'
      | 'brightnessTemperature'
      | 'persistenceDays'
      | 'distanceToFacilityM'
    >
  >;
}

export interface EmergencyFacility {
  id: string;
  name: string;
  type: EmergencyFacilityType;
  latitude: number;
  longitude: number;
  address: string | null;
  /** Never invented — null when the upstream source does not state it. */
  capacity: string | null;
  phone: string | null;
  operator: string | null;
  ownership: string | null;
  osmId: string | null;
  source: string;
  sourceUrl: string | null;
  lastVerified: string | null;
  distanceMeters?: number;
}

export interface Alert {
  id: string;
  title: string;
  message: string;
  severity: Severity;
  status: AlertStatus;
  isRead: boolean;
  /** Risk drivers captured when the alert fired, not recomputed since. */
  reasons: string[];
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  resolutionNote: string | null;
  hotspotId: string | null;
  hotspot:
    | (Pick<
        Hotspot,
        | 'id'
        | 'latitude'
        | 'longitude'
        | 'riskLevel'
        | 'riskScore'
        | 'detectedAt'
        | 'persistenceDays'
        | 'mlClass'
        | 'mlConfidence'
        | 'classificationPath'
        | 'inBhopalBoundary'
        | 'eventType'
      > & { industrialFacility: FacilityRef | null })
    | null;
  acknowledgedById: string | null;
  acknowledgedBy: { id: string; name: string; email: string } | null;
  acknowledgedAt: string | null;
}

// ---------------------------------------------------------------------------
// Bhopal pilot
// ---------------------------------------------------------------------------

export interface BoundaryResponse {
  id: string;
  name: string;
  level: string;
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
  areaKm2: number;
  simplifiedGeoJson: { type: string; coordinates: number[][][] } | null;
  source: string;
  sourceUrl: string | null;
  license: string | null;
  attribution: string | null;
  retrievedAt: string | null;
  fetchBbox: { minLng: number; minLat: number; maxLng: number; maxLat: number };
  note: string;
}

export interface ImpactZone {
  radiusKm: number;
  counts: {
    hospitals: number;
    fireStations: number;
    schools: number;
    police: number;
    industrialFacilities: number;
    otherHotspots: number;
  };
  /** Always null — TIMS does not infer affected population. */
  populationEstimate: null;
}

export interface ImpactAnalysis {
  hotspotId: string;
  latitude: number;
  longitude: number;
  zones: ImpactZone[];
  nearestHospital: EmergencyFacility | null;
  nearestFireStation: EmergencyFacility | null;
  distanceNote: string;
  populationDataAvailable: false;
}

export interface ResponsePlan {
  hotspot: Pick<
    Hotspot,
    | 'id'
    | 'latitude'
    | 'longitude'
    | 'detectedAt'
    | 'riskLevel'
    | 'riskScore'
    | 'mlClass'
    | 'mlConfidence'
    | 'classificationPath'
    | 'persistenceDays'
    | 'inBhopalBoundary'
    | 'firmsProduct'
  >;
  nearestIndustrialFacility: (IndustrialFacility & { distanceMeters: number | null }) | null;
  nearestHospital: EmergencyFacility | null;
  nearestFireStation: EmergencyFacility | null;
  nearestSchool: EmergencyFacility | null;
  receptorsWithinFirstZone: EmergencyFacility[];
  riskAssessment: RiskAssessment | null;
  populationEstimate: null;
  populationNote: string;
  routingNote: string;
  disclaimer: string;
}

export interface WeatherReading {
  observedAt: string;
  latitude: number;
  longitude: number;
  temperatureC: number | null;
  humidityPct: number | null;
  windSpeedMs: number | null;
  windDirectionDeg: number | null;
  rainfallMm: number | null;
  warning: string | null;
  provider: string;
  providerLabel: string;
  /** False when the provider is not an official Indian government source. */
  isOfficialSource: boolean;
  sourceUrl: string | null;
}

export interface WeatherResult {
  available: boolean;
  reading: WeatherReading | null;
  note: string;
  attemptedProviders: string[];
  providers: Array<{ key: string; label: string; configured: boolean; isOfficialSource: boolean }>;
}

export interface DataSource {
  id: string;
  key: string;
  name: string;
  purpose: string;
  status: DataSourceStatus;
  updateFrequency: string | null;
  officialUrl: string | null;
  license: string | null;
  attribution: string | null;
  isGovernment: boolean;
  statusNote: string | null;
  lastSyncAt: string | null;
  lastSyncRecords: number | null;
  lastSyncError: string | null;
}

export interface DataSourcesResponse {
  sources: DataSource[];
  recordCounts: {
    hotspots: number;
    industrialFacilities: number;
    emergencyFacilities: number;
    administrativeBoundaries: number;
    weatherObservations: number;
  };
  capabilities: {
    postgis: PostgisStatus;
    firms: { configured: boolean };
    osm: { enabled: boolean };
    ml: MlServiceHealth;
    imd: { configured: boolean };
    bhuvan: { configured: boolean };
    demoMode: boolean;
  };
  disclaimer: string;
}

export interface MlServiceHealth {
  reachable: boolean;
  modelVersion: string | null;
  reason?: string;
  checkedAt: string | null;
}

export interface PostgisStatus {
  available: boolean;
  version: string | null;
  checkedAt: string;
  reason?: string;
}

export interface HealthResponse {
  status: string;
  service: string;
  pilot: { id: string; label: string; state: string; country: string; timezone: string };
  environment: string;
  uptimeSeconds: number;
  timestamp: string;
  dependencies: {
    database: boolean;
    postgis: PostgisStatus;
    firms: { provider: string; configured: boolean };
    osm: { provider: string; enabled: boolean };
    mlService: MlServiceHealth;
    weather: { imdConfigured: boolean; fallbackEnabled: boolean };
    bhuvan: { configured: boolean };
    cronJobs: boolean;
    realtimeClients: number;
    demoMode: boolean;
  };
}

export interface Report {
  id: string;
  title: string;
  kind: string;
  status: ReportStatus;
  periodStart: string;
  periodEnd: string;
  parameters: Record<string, unknown> | null;
  summary: Record<string, unknown> | null;
  hotspotCount: number;
  alertCount: number;
  requestedById: string | null;
  requestedBy: { id: string; name: string; email: string } | null;
  createdAt: string;
  completedAt: string | null;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

export interface StatDelta {
  value: number;
  previous: number;
  changePercent: number | null;
}

export interface AnalyticsSummary {
  windowDays: number;
  generatedAt: string;
  totalThermalEvents: StatDelta;
  industrialFireEvents: StatDelta;
  persistentThermalSources: StatDelta;
  highRiskEvents: StatDelta;
  averageRiskScore: number;
  averageBrightnessTemperature: number;
  unreadAlerts: number;
  monitoredFacilities: number;
  riskDistribution: Array<{ riskLevel: RiskLevel; count: number }>;
  alertsBySeverity: Array<{ severity: Severity; count: number }>;
}

export interface TrendPoint {
  date: string;
  total: number;
  industrial: number;
  persistent: number;
  highRisk: number;
  avgRiskScore: number;
}

export interface CategoryBreakdown {
  windowDays: number;
  byEventType: Array<{
    eventType: EventType;
    count: number;
    share: number;
    avgRiskScore: number;
    avgBrightnessTemperature: number;
  }>;
  byRiskLevel: Array<{ riskLevel: RiskLevel; count: number; share: number }>;
  bySource: Array<{ source: string; count: number }>;
  byRegion: Array<{ region: string; count: number; highRisk: number }>;
  byFacilityType: Array<{ facilityType: string; count: number; hotspotCount: number }>;
}

export interface FacilitySummary {
  total: number;
  byType: Array<{ type: FacilityType; count: number }>;
  topFacilities: Array<{
    id: string;
    name: string;
    type: FacilityType;
    location: string;
    riskLevel: RiskLevel;
    latitude: number;
    longitude: number;
    hotspotCount: number;
  }>;
}

export interface EmergencySummary {
  total: number;
  byType: Array<{ type: EmergencyFacilityType; count: number }>;
  coverageNote: string;
}

export interface NearbyFacility extends FacilityRef {
  latitude: number;
  longitude: number;
  riskLevel: RiskLevel;
  operator: string | null;
  distanceMeters: number;
}

// ---------------------------------------------------------------------------
// Pagination and filters
// ---------------------------------------------------------------------------

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface Paginated<T> {
  items: T[];
  meta: PaginationMeta & { unreadCount?: number };
}

export interface HotspotFilters {
  page?: number;
  pageSize?: number;
  eventType?: EventType[];
  riskLevel?: RiskLevel[];
  minConfidence?: number;
  minRiskScore?: number;
  persistentOnly?: boolean;
  from?: string;
  to?: string;
  bbox?: string;
  industrialFacilityId?: string;
  search?: string;
  sortBy?: 'detectedAt' | 'riskScore' | 'confidence' | 'brightnessTemperature' | 'persistenceDays';
  sortOrder?: 'asc' | 'desc';
}

export interface AlertFilters {
  page?: number;
  pageSize?: number;
  severity?: Severity;
  status?: AlertStatus;
  isRead?: boolean;
  hotspotId?: string;
  from?: string;
  to?: string;
  sortOrder?: 'asc' | 'desc';
}
