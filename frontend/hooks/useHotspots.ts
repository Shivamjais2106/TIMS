'use client';

import { useMemo, useState } from 'react';
import { hotspotService } from '@/services';
import type { HotspotFilters } from '@/types';
import { useApi } from './useApi';
import { useDebounce } from './useDebounce';

/**
 * Hotspot list state: filters, debounced search and pagination in one place so
 * the map page and the table page stay behaviourally identical.
 */
export function useHotspots(initial: HotspotFilters = {}) {
  const [filters, setFilters] = useState<HotspotFilters>({ page: 1, pageSize: 25, ...initial });
  const debouncedSearch = useDebounce(filters.search ?? '', 350);

  const query = useMemo<HotspotFilters>(
    () => ({ ...filters, search: debouncedSearch || undefined }),
    [filters, debouncedSearch],
  );

  const state = useApi(() => hotspotService.list(query), [JSON.stringify(query)]);

  function updateFilters(patch: Partial<HotspotFilters>) {
    // Any filter change resets to page 1 — staying on page 7 of a narrower
    // result set just shows an empty table.
    setFilters((current) => ({ ...current, ...patch, page: patch.page ?? 1 }));
  }

  return {
    filters,
    setFilters: updateFilters,
    setPage: (page: number) => setFilters((current) => ({ ...current, page })),
    hotspots: state.data?.items ?? [],
    meta: state.data?.meta,
    loading: state.loading,
    error: state.error,
    refetch: state.refetch,
  };
}
