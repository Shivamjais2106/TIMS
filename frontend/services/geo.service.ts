import { api, withDemoFallback } from '@/lib/api';
import type { Hotspot, NearbyFacility, PostgisStatus } from '@/types';

export interface RadiusQuery {
  lat: number;
  lng: number;
  radiusKm?: number;
  limit?: number;
}

/**
 * Geospatial endpoints.
 *
 * Only `status` has a demo fallback. The radius / polygon queries deliberately
 * do not: if PostGIS is unavailable the API returns 503 and the UI says so,
 * rather than showing distances that were never actually computed.
 */
export const geoService = {
  status: () =>
    withDemoFallback(
      () => api.get<PostgisStatus>('/geo/status', { auth: false }),
      () => ({
        available: false,
        version: null,
        checkedAt: new Date().toISOString(),
        reason: 'API unreachable (demo mode)',
      }),
    ),

  facilitiesNear: (query: RadiusQuery) =>
    api.get<NearbyFacility[]>('/geo/facilities/near', { query: { ...query } }),

  nearestFacility: (lat: number, lng: number, maxDistanceKm = 50) =>
    api.get<NearbyFacility | null>('/geo/facilities/nearest', { query: { lat, lng, maxDistanceKm } }),

  hotspotsNear: (query: RadiusQuery) => api.get<Hotspot[]>('/geo/hotspots/near', { query: { ...query } }),

  hotspotsInArea: (polygon: { type: 'Polygon'; coordinates: number[][][] }, limit = 500) =>
    api.post<Hotspot[]>('/geo/hotspots/in-area', { polygon, limit }),
};
