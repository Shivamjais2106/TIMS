import { api, withDemoFallback } from '@/lib/api';
import { MOCK_HOTSPOTS } from '@/lib/mockData';
import type { Hotspot, HotspotFilters, NearbyFacility, Paginated, PaginationMeta } from '@/types';

function paginateMock(filters: HotspotFilters): Paginated<Hotspot> {
  let items = [...MOCK_HOTSPOTS];

  if (filters.eventType?.length) items = items.filter((h) => filters.eventType!.includes(h.eventType));
  if (filters.riskLevel?.length) items = items.filter((h) => filters.riskLevel!.includes(h.riskLevel));
  if (filters.minConfidence !== undefined) items = items.filter((h) => h.confidence >= filters.minConfidence!);
  if (filters.minRiskScore !== undefined) items = items.filter((h) => h.riskScore >= filters.minRiskScore!);
  if (filters.persistentOnly) items = items.filter((h) => h.persistenceDays >= 3);
  if (filters.industrialFacilityId) {
    items = items.filter((h) => h.industrialFacilityId === filters.industrialFacilityId);
  }
  if (filters.search) {
    const needle = filters.search.toLowerCase();
    items = items.filter(
      (h) =>
        h.id.toLowerCase().includes(needle) ||
        (h.region ?? '').toLowerCase().includes(needle) ||
        (h.industrialFacility?.name ?? '').toLowerCase().includes(needle),
    );
  }

  const sortBy = filters.sortBy ?? 'detectedAt';
  const direction = filters.sortOrder === 'asc' ? 1 : -1;
  items.sort((a, b) => {
    const left = sortBy === 'detectedAt' ? new Date(a.detectedAt).getTime() : (a[sortBy] as number);
    const right = sortBy === 'detectedAt' ? new Date(b.detectedAt).getTime() : (b[sortBy] as number);
    return (left - right) * direction;
  });

  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 25;
  const total = items.length;
  const totalPages = Math.ceil(total / pageSize);

  const meta: PaginationMeta = {
    page,
    pageSize,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };

  return { items: items.slice((page - 1) * pageSize, page * pageSize), meta };
}

export const hotspotService = {
  async list(filters: HotspotFilters = {}): Promise<Paginated<Hotspot>> {
    return withDemoFallback(
      async () => {
        const { data, meta } = await api.getWithMeta<Hotspot[]>('/hotspots', { query: filters });
        return { items: data ?? [], meta: meta as unknown as Paginated<Hotspot>['meta'] };
      },
      () => paginateMock(filters),
    );
  },

  getById: (id: string) =>
    withDemoFallback(
      () => api.get<Hotspot>(`/hotspots/${id}`),
      () => {
        const found = MOCK_HOTSPOTS.find((hotspot) => hotspot.id === id);
        if (!found) throw new Error(`Hotspot ${id} not found`);
        return found;
      },
    ),

  recent: (limit = 8) =>
    withDemoFallback(
      () => api.get<Hotspot[]>('/hotspots/recent'),
      () => MOCK_HOTSPOTS.slice(0, limit),
    ),

  nearbyFacilities: (id: string, radiusKm = 10) =>
    api.get<NearbyFacility[]>(`/hotspots/${id}/nearby-facilities`, { query: { radiusKm } }),

  create: (payload: Partial<Hotspot>) => api.post<Hotspot>('/hotspots', payload),
  update: (id: string, payload: Partial<Hotspot>) => api.patch<Hotspot>(`/hotspots/${id}`, payload),
  remove: (id: string) => api.delete<void>(`/hotspots/${id}`),
};
