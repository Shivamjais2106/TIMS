'use client';

import { Layers, Search, X } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { MapFilters, type MapFilterState } from '@/components/map/MapFilters';
import { MapLegend } from '@/components/map/MapLegend';
import { MapView } from '@/components/map/MapView';
import { Card } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { useApi } from '@/hooks/useApi';
import { EVENT_TYPES, RISK_LEVELS } from '@/lib/constants';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { geoService } from '@/services/geo.service';
import { hotspotService } from '@/services/hotspot.service';
import { industryService } from '@/services/industry.service';
import type { Hotspot } from '@/types';

const DEFAULT_FILTERS: MapFilterState = {
  eventTypes: [...EVENT_TYPES],
  riskLevels: [...RISK_LEVELS],
  showFacilities: true,
  showHotspots: true,
  radiusKm: 10,
};

export function MapClient() {
  const searchParams = useSearchParams();
  const focusId = searchParams.get('focus');

  const [filters, setFilters] = useState<MapFilterState>(DEFAULT_FILTERS);
  const [panelOpen, setPanelOpen] = useState(false);
  const [selected, setSelected] = useState<Hotspot | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(focusId);

  // A map query is bounded by what can usefully be drawn, not by the page size
  // used elsewhere — hence 2000 rather than 25. Ordered by recency so the layer
  // reflects the whole area of interest rather than only the hottest clusters.
  const hotspots = useApi(
    () => hotspotService.list({ pageSize: 2000, sortBy: 'detectedAt', sortOrder: 'desc' }),
    [],
  );
  const facilities = useApi(() => industryService.list({ pageSize: 500 }), []);
  const postgis = useApi(() => geoService.status(), []);

  useEffect(() => {
    setSelectedId(focusId);
  }, [focusId]);

  const visible = useMemo(() => {
    const items = hotspots.data?.items ?? [];
    return items.filter(
      (hotspot) =>
        filters.eventTypes.includes(hotspot.eventType) && filters.riskLevels.includes(hotspot.riskLevel),
    );
  }, [hotspots.data, filters.eventTypes, filters.riskLevels]);

  const nearby = useApi(
    () =>
      selected
        ? geoService.facilitiesNear({
            lat: selected.latitude,
            lng: selected.longitude,
            radiusKm: filters.radiusKm,
            limit: 8,
          })
        : Promise.resolve([]),
    [selected?.id, filters.radiusKm],
  );

  return (
    <div className="space-y-4">
      {/* --- Status strip ---------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-3">
        <Card className="flex items-center gap-4 px-4 py-2.5">
          <span className="text-xs text-fg-muted">
            Rendering <span className="tims-data font-semibold text-fg">{formatNumber(visible.length)}</span> of{' '}
            <span className="tims-data">{formatNumber(hotspots.data?.items.length ?? 0)}</span> detections
          </span>
          <span className="h-4 w-px bg-line" aria-hidden />
          <span className="text-xs text-fg-muted">
            <span className="tims-data font-semibold text-fg">{formatNumber(facilities.data?.items.length ?? 0)}</span>{' '}
            facilities
          </span>
        </Card>

        {postgis.data ? (
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium ring-1 ring-inset',
              postgis.data.available
                ? 'bg-emerald-500/10 text-emerald-600 ring-emerald-500/25 dark:text-emerald-400'
                : 'bg-amber-500/10 text-amber-600 ring-amber-500/25 dark:text-amber-400',
            )}
            title={postgis.data.reason ?? undefined}
          >
            <span className={cn('size-1.5 rounded-full', postgis.data.available ? 'bg-emerald-500' : 'bg-amber-500')} />
            PostGIS {postgis.data.available ? postgis.data.version : 'unavailable'}
          </span>
        ) : null}

        <button
          type="button"
          onClick={() => setPanelOpen((value) => !value)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-medium text-fg-muted transition-colors hover:text-fg lg:hidden"
        >
          <Layers className="size-3.5" aria-hidden />
          {panelOpen ? 'Hide' : 'Show'} controls
        </button>
      </div>

      {/* --- Map ------------------------------------------------------------- */}
      <Card className="relative overflow-hidden">
        <div className="h-[calc(100vh-260px)] min-h-[480px]">
          {hotspots.loading && !hotspots.data ? (
            <LoadingState label="Loading thermal detections" minHeight={480} />
          ) : hotspots.error ? (
            <ErrorState message={hotspots.error} onRetry={hotspots.refetch} />
          ) : (
            <MapView
              hotspots={visible}
              facilities={facilities.data?.items ?? []}
              showHotspots={filters.showHotspots}
              showFacilities={filters.showFacilities}
              radiusKm={filters.radiusKm}
              selectedHotspotId={selectedId}
              onSelectHotspot={(hotspot) => {
                setSelected(hotspot);
                setSelectedId(hotspot?.id ?? null);
              }}
              fitToData
            />
          )}
        </div>

        {/* Controls float over the map on desktop, collapse to a drawer on mobile. */}
        <div
          className={cn(
            'absolute right-3 top-3 z-[600] flex max-h-[calc(100%-24px)] flex-col gap-3 overflow-y-auto',
            panelOpen ? 'flex' : 'hidden lg:flex',
          )}
        >
          <MapFilters value={filters} onChange={setFilters} />
          <MapLegend />
        </div>
      </Card>

      {/* --- Nearest facilities for the selected detection -------------------- */}
      {selected ? (
        <Card>
          <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-3">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-fg">
                Facilities within {filters.radiusKm} km of the selected detection
              </h2>
              <p className="tims-data mt-0.5 truncate text-[11px] text-fg-subtle">
                {selected.latitude.toFixed(4)}, {selected.longitude.toFixed(4)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelected(null);
                setSelectedId(null);
              }}
              className="grid size-7 place-items-center rounded-md text-fg-subtle ring-1 ring-inset ring-line hover:bg-surface-3"
              aria-label="Clear selection"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </header>

          <div className="p-5">
            {nearby.loading ? (
              <LoadingState label="Running PostGIS radius query" minHeight={100} />
            ) : nearby.error ? (
              <ErrorState message={nearby.error} onRetry={nearby.refetch} />
            ) : (nearby.data?.length ?? 0) === 0 ? (
              <p className="flex items-center gap-2 text-xs text-fg-muted">
                <Search className="size-3.5" aria-hidden />
                No registered industrial facility within {filters.radiusKm} km. Widen the analysis radius to search
                further.
              </p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {(nearby.data ?? []).map((facility) => (
                  <li
                    key={facility.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface-2 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-fg">{facility.name}</p>
                      <p className="truncate text-[11px] text-fg-subtle">{facility.location}</p>
                    </div>
                    <span className="tims-data shrink-0 text-[11px] font-semibold text-primary">
                      {(facility.distanceMeters / 1000).toFixed(2)} km
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
