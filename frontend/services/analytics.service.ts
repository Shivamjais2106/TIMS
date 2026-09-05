import { api, withDemoFallback } from '@/lib/api';
import { mockCategories, mockSummary, mockTrends } from '@/lib/mockData';
import type { AnalyticsSummary, CategoryBreakdown, TrendPoint } from '@/types';

export const analyticsService = {
  summary: (days = 30) =>
    withDemoFallback(
      () => api.get<AnalyticsSummary>('/analytics/summary', { query: { days } }),
      () => mockSummary(days),
    ),

  trends: (days = 30, interval: 'day' | 'week' | 'month' = 'day') =>
    withDemoFallback(
      () => api.get<TrendPoint[]>('/analytics/trends', { query: { days, interval } }),
      () => mockTrends(days),
    ),

  categories: (days = 30) =>
    withDemoFallback(
      () => api.get<CategoryBreakdown>('/analytics/categories', { query: { days } }),
      () => mockCategories(days),
    ),
};
