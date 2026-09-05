import { api, withDemoFallback } from '@/lib/api';
import { MOCK_FACILITIES, MOCK_HOTSPOTS, mockFacilitySummary } from '@/lib/mockData';
import type {
  FacilityDetail,
  FacilitySummary,
  FacilityType,
  IndustrialFacility,
  Paginated,
  RiskLevel,
} from '@/types';

export interface IndustryFilters {
  page?: number;
  pageSize?: number;
  type?: FacilityType;
  riskLevel?: RiskLevel;
  search?: string;
  sortBy?: 'name' | 'createdAt' | 'riskLevel' | 'type';
  sortOrder?: 'asc' | 'desc';
  withHotspotCount?: boolean;
}

function paginateMock(filters: IndustryFilters): Paginated<IndustrialFacility> {
  let items = MOCK_FACILITIES.map((facility) => ({
    ...facility,
    _count: { hotspots: MOCK_HOTSPOTS.filter((h) => h.industrialFacilityId === facility.id).length },
  }));

  if (filters.type) items = items.filter((facility) => facility.type === filters.type);
  if (filters.riskLevel) items = items.filter((facility) => facility.riskLevel === filters.riskLevel);
  if (filters.search) {
    const needle = filters.search.toLowerCase();
    items = items.filter(
      (facility) =>
        facility.name.toLowerCase().includes(needle) ||
        facility.location.toLowerCase().includes(needle) ||
        (facility.operator ?? '').toLowerCase().includes(needle),
    );
  }

  const direction = filters.sortOrder === 'desc' ? -1 : 1;
  items.sort((a, b) => String(a[filters.sortBy ?? 'name']).localeCompare(String(b[filters.sortBy ?? 'name'])) * direction);

  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 25;
  const total = items.length;
  const totalPages = Math.ceil(total / pageSize);

  return {
    items: items.slice((page - 1) * pageSize, page * pageSize),
    meta: { page, pageSize, total, totalPages, hasNextPage: page < totalPages, hasPreviousPage: page > 1 },
  };
}

export const industryService = {
  async list(filters: IndustryFilters = {}): Promise<Paginated<IndustrialFacility>> {
    return withDemoFallback(
      async () => {
        const { data, meta } = await api.getWithMeta<IndustrialFacility[]>('/industries', { query: filters });
        return { items: data ?? [], meta: meta as unknown as Paginated<IndustrialFacility>['meta'] };
      },
      () => paginateMock(filters),
    );
  },

  getById: (id: string) =>
    withDemoFallback(
      () => api.get<FacilityDetail>(`/industries/${id}`),
      () => {
        const facility = MOCK_FACILITIES.find((item) => item.id === id);
        if (!facility) throw new Error(`Facility ${id} not found`);
        const hotspots = MOCK_HOTSPOTS.filter((hotspot) => hotspot.industrialFacilityId === id).slice(0, 10);
        return { ...facility, _count: { hotspots: hotspots.length }, hotspots } as FacilityDetail;
      },
    ),

  summary: (): Promise<FacilitySummary> =>
    withDemoFallback(() => api.get<FacilitySummary>('/industries/summary'), mockFacilitySummary),

  create: (payload: Partial<IndustrialFacility>) => api.post<IndustrialFacility>('/industries', payload),
  update: (id: string, payload: Partial<IndustrialFacility>) =>
    api.patch<IndustrialFacility>(`/industries/${id}`, payload),
  remove: (id: string) => api.delete<void>(`/industries/${id}`),
};
