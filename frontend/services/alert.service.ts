import { api, withDemoFallback } from '@/lib/api';
import { MOCK_ALERTS } from '@/lib/mockData';
import type { Alert, Paginated, Severity } from '@/types';

export interface AlertFilters {
  page?: number;
  pageSize?: number;
  severity?: Severity;
  isRead?: boolean;
  hotspotId?: string;
  sortOrder?: 'asc' | 'desc';
}

function paginateMock(filters: AlertFilters): Paginated<Alert> {
  let items = [...MOCK_ALERTS];
  if (filters.severity) items = items.filter((alert) => alert.severity === filters.severity);
  if (filters.isRead !== undefined) items = items.filter((alert) => alert.isRead === filters.isRead);

  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 25;
  const total = items.length;
  const totalPages = Math.ceil(total / pageSize);

  return {
    items: items.slice((page - 1) * pageSize, page * pageSize),
    meta: {
      page,
      pageSize,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
      unreadCount: MOCK_ALERTS.filter((alert) => !alert.isRead).length,
    },
  };
}

export const alertService = {
  async list(filters: AlertFilters = {}): Promise<Paginated<Alert>> {
    return withDemoFallback(
      async () => {
        const { data, meta } = await api.getWithMeta<Alert[]>('/alerts', { query: filters });
        return { items: data ?? [], meta: meta as unknown as Paginated<Alert>['meta'] };
      },
      () => paginateMock(filters),
    );
  },

  recent: (limit = 5) =>
    withDemoFallback(
      () => api.get<Alert[]>('/alerts/recent'),
      () => MOCK_ALERTS.slice(0, limit),
    ),

  unreadCount: () =>
    withDemoFallback(
      () => api.get<{ total: number; bySeverity: Record<Severity, number> }>('/alerts/unread-count'),
      () => {
        const unread = MOCK_ALERTS.filter((alert) => !alert.isRead);
        const bySeverity: Record<Severity, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
        for (const alert of unread) bySeverity[alert.severity] += 1;
        return { total: unread.length, bySeverity };
      },
    ),

  markRead: (id: string) => api.patch<Alert>(`/alerts/${id}/read`),
  markAllRead: () => api.patch<{ updated: number }>('/alerts/read-all'),
};
