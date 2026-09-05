/**
 * Shared domain types.
 *
 * These mirror the Prisma models exposed by the TIMS API. They are declared by
 * hand rather than generated so the frontend can be developed against the
 * contract without needing the backend's Prisma client in its dependency tree.
 */

export type Role = 'ADMIN' | 'ANALYST' | 'VIEWER';

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

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type Severity = RiskLevel;

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

/** Facility fields embedded inside hotspot and alert payloads. */
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
  dayNight: string | null;
  region: string | null;
  externalId: string | null;
  industrialFacilityId: string | null;
  industrialFacility: FacilityRef | null;
  distanceToFacilityM: number | null;
  createdAt: string;
  updatedAt: string;
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
      | 'eventType'
      | 'riskLevel'
      | 'riskScore'
      | 'confidence'
      | 'brightnessTemperature'
      | 'persistenceDays'
      | 'distanceToFacilityM'
    >
  >;
}

export interface Alert {
  id: string;
  title: string;
  message: string;
  severity: Severity;
  isRead: boolean;
  createdAt: string;
  updatedAt: string;
  hotspotId: string | null;
  hotspot: (Pick<
    Hotspot,
    'id' | 'latitude' | 'longitude' | 'eventType' | 'riskLevel' | 'riskScore' | 'detectedAt' | 'persistenceDays'
  > & { industrialFacility: FacilityRef | null }) | null;
  acknowledgedById: string | null;
  acknowledgedBy: { id: string; name: string; email: string } | null;
  acknowledgedAt: string | null;
}

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

export interface NearbyFacility extends FacilityRef {
  latitude: number;
  longitude: number;
  riskLevel: RiskLevel;
  operator: string | null;
  distanceMeters: number;
}

export interface PostgisStatus {
  available: boolean;
  version: string | null;
  checkedAt: string;
  reason?: string;
}

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
  /** `unreadCount` is only present on the alerts endpoint. */
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
