import { api } from '@/lib/api';
import type {
  Alert,
  AlertFilters,
  AlertStatus,
  AnalyticsSummary,
  BoundaryResponse,
  CategoryBreakdown,
  DataSourcesResponse,
  EmergencyFacility,
  EmergencySummary,
  FacilityDetail,
  FacilitySummary,
  HealthResponse,
  Hotspot,
  HotspotFilters,
  ImpactAnalysis,
  IndustrialFacility,
  NearbyFacility,
  Paginated,
  Report,
  ResponsePlan,
  Severity,
  TrendPoint,
  WeatherResult,
} from '@/types';

/**
 * Typed API clients, one object per domain.
 *
 * Every method hits a real endpoint. There is no mock or demo fallback here —
 * see the note in lib/api.ts for why.
 */

/**
 * Unwraps a paginated envelope into `{ items, meta }`.
 *
 * List endpoints return a bare array in `data` with pagination in `meta`. This
 * normalises defensively anyway: an endpoint that wrapped its rows in
 * `{ items }` previously handed a plain object to callers that immediately
 * called `.filter()` on it, crashing the page with
 * "emergencyItems.filter is not a function". A UI should degrade, not die,
 * when a response shape shifts.
 */
async function paginated<T>(path: string, query: object): Promise<Paginated<T>> {
  const { data, meta } = await api.getWithMeta<T[] | { items?: T[] } | null>(path, { query });

  const items = Array.isArray(data)
    ? data
    : Array.isArray((data as { items?: T[] } | null)?.items)
      ? ((data as { items: T[] }).items)
      : [];

  return { items, meta: meta as unknown as Paginated<T>['meta'] };
}

export const hotspotService = {
  list: (filters: HotspotFilters = {}) => paginated<Hotspot>('/hotspots', filters),
  getById: (id: string) => api.get<Hotspot>(`/hotspots/${id}`),
  recent: (limit = 8) => api.get<Hotspot[]>('/hotspots/recent', { query: { limit } }),
  nearbyFacilities: (id: string, radiusKm = 5) =>
    api.get<NearbyFacility[]>(`/hotspots/${id}/nearby-facilities`, { query: { radiusKm } }),
  create: (payload: Partial<Hotspot>) => api.post<Hotspot>('/hotspots', payload),
  update: (id: string, payload: Partial<Hotspot>) => api.patch<Hotspot>(`/hotspots/${id}`, payload),
  remove: (id: string) => api.delete<void>(`/hotspots/${id}`),
};

export const alertService = {
  list: (filters: AlertFilters = {}) => paginated<Alert>('/alerts', filters),
  getById: (id: string) => api.get<Alert>(`/alerts/${id}`),
  recent: (limit = 5) => api.get<Alert[]>('/alerts/recent', { query: { limit } }),
  unreadCount: () =>
    api.get<{ total: number; bySeverity: Record<Severity, number> }>('/alerts/unread-count'),
  statusCounts: () => api.get<Record<AlertStatus, number>>('/alerts/status-counts'),
  markRead: (id: string) => api.patch<Alert>(`/alerts/${id}/read`),
  markAllRead: () => api.patch<{ updated: number }>('/alerts/read-all'),
  /** Auditable triage action — records who took ownership and when. */
  acknowledge: (id: string, note?: string) =>
    api.patch<Alert>(`/alerts/${id}/acknowledge`, { note }),
  setStatus: (id: string, status: AlertStatus, note?: string) =>
    api.patch<Alert>(`/alerts/${id}/status`, { status, note }),
  create: (payload: { title: string; message: string; severity: Severity; hotspotId?: string }) =>
    api.post<Alert>('/alerts', payload),
};

export const industryService = {
  list: (query: { page?: number; pageSize?: number; type?: string; search?: string; sortBy?: string } = {}) =>
    paginated<IndustrialFacility>('/industries', query),
  getById: (id: string) => api.get<FacilityDetail>(`/industries/${id}`),
  summary: () => api.get<FacilitySummary>('/industries/summary'),
};

export const emergencyService = {
  list: (query: { page?: number; pageSize?: number; type?: string; search?: string } = {}) =>
    paginated<EmergencyFacility>('/emergency', query),
  hospitals: (limit = 500) =>
    api.get<{ items: EmergencyFacility[]; total: number; disclaimer: string }>(
      '/emergency/hospitals',
      { query: { limit } },
    ),
  fireStations: () =>
    api.get<{
      items: EmergencyFacility[];
      total: number;
      disclaimer: string;
      coverageWarning: string | null;
    }>('/emergency/fire-stations'),
  near: (lat: number, lon: number, radiusKm: number, type?: string) =>
    api.get<{ items: EmergencyFacility[]; total: number; radiusKm: number; disclaimer: string }>(
      '/emergency/near',
      { query: { lat, lon, radiusKm, type } },
    ),
  responsePlan: (hotspotId: string) => api.get<ResponsePlan>(`/emergency/response/${hotspotId}`),
  summary: () => api.get<EmergencySummary>('/emergency-summary'),
};

export const analyticsService = {
  summary: (windowDays = 30) => api.get<AnalyticsSummary>('/analytics/summary', { query: { windowDays } }),
  trends: (windowDays = 30) => api.get<TrendPoint[]>('/analytics/trends', { query: { windowDays } }),
  categories: (windowDays = 30) =>
    api.get<CategoryBreakdown>('/analytics/categories', { query: { windowDays } }),
};

export const bhopalService = {
  /** Public — no token required, so the transparency page works signed out. */
  boundary: () => api.get<BoundaryResponse>('/boundaries/bhopal', { auth: false }),
  dataSources: () => api.get<DataSourcesResponse>('/datasources', { auth: false }),
  health: () => api.get<HealthResponse>('/health', { auth: false }),
  impact: (hotspotId: string) => api.get<ImpactAnalysis>(`/impact/${hotspotId}`),
  weather: (lat?: number, lon?: number) =>
    api.get<WeatherResult>('/weather', { query: lat !== undefined ? { lat, lon } : {} }),
};

export const reportService = {
  list: (query: { page?: number; pageSize?: number } = {}) => paginated<Report>('/reports', query),
  getById: (id: string) => api.get<Report>(`/reports/${id}`),
  generate: (payload: {
    kind: 'incident' | 'daily' | 'weekly' | 'custom';
    title?: string;
    periodStart?: string;
    periodEnd?: string;
    hotspotId?: string;
  }) => api.post<Report>('/reports', payload),
  remove: (id: string) => api.delete<void>(`/reports/${id}`),
};

export const adminService = {
  /** ADMIN only. Triggers a real NASA FIRMS fetch. */
  syncFirms: (payload: { forceArchive?: boolean; dayRange?: number } = {}) =>
    api.post<Record<string, unknown>>('/admin/sync/firms', payload),
  syncOsm: () => api.post<Record<string, unknown>>('/admin/sync/osm'),
  recompute: (allTime = false) => api.post<Record<string, unknown>>('/admin/recompute', { allTime }),
};

export const geoService = {
  status: () => api.get<{ available: boolean; version: string | null }>('/geo/status'),
  facilitiesNear: (lat: number, lon: number, radiusKm: number) =>
    api.get<NearbyFacility[]>('/geo/facilities/near', { query: { lat, lon, radiusKm } }),
  nearestFacility: (lat: number, lon: number) =>
    api.get<NearbyFacility | null>('/geo/facilities/nearest', { query: { lat, lon } }),
};

export { authService } from './auth.service';
