'use client';

import { Filter, MapPin, Search, X } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { HotspotPopup } from '@/components/map/HotspotPopup';
import { Card } from '@/components/ui/Card';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { ErrorState } from '@/components/ui/EmptyState';
import { Input, Select } from '@/components/ui/Input';
import { RiskIndicator } from '@/components/ui/RiskIndicator';
import { useHotspots } from '@/hooks/useHotspots';
import { EVENT_TYPES, EVENT_TYPE_META, RISK_LEVELS, RISK_META } from '@/lib/constants';
import { formatDateTimeShort, formatNumber, formatTemperature, humanise } from '@/lib/format';
import type { EventType, Hotspot, RiskLevel } from '@/types';

const COLUMNS: Column<Hotspot>[] = [
  {
    key: 'event',
    header: 'Event',
    render: (hotspot) => {
      const meta = EVENT_TYPE_META[hotspot.eventType];
      return (
        <div className="flex items-center gap-2.5">
          <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: meta.color }} aria-hidden />
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-fg">{meta.label}</p>
            <p className="tims-data truncate text-[10px] text-fg-subtle">
              {hotspot.latitude.toFixed(4)}, {hotspot.longitude.toFixed(4)}
            </p>
          </div>
        </div>
      );
    },
  },
  {
    key: 'detectedAt',
    header: 'Detected',
    hideOnMobile: true,
    className: 'whitespace-nowrap',
    render: (hotspot) => (
      <span className="tims-data text-xs text-fg-muted">{formatDateTimeShort(hotspot.detectedAt)}</span>
    ),
  },
  {
    key: 'facility',
    header: 'Nearest facility',
    hideOnMobile: true,
    render: (hotspot) =>
      hotspot.industrialFacility ? (
        <div className="min-w-0">
          <p className="truncate text-xs text-fg">{hotspot.industrialFacility.name}</p>
          <p className="truncate text-[10px] text-fg-subtle">
            {hotspot.distanceToFacilityM != null
              ? `${(hotspot.distanceToFacilityM / 1000).toFixed(2)} km away`
              : hotspot.industrialFacility.location}
          </p>
        </div>
      ) : (
        <span className="text-xs text-fg-subtle">&mdash;</span>
      ),
  },
  {
    key: 'brightness',
    header: 'Brightness',
    hideOnMobile: true,
    render: (hotspot) => (
      <span className="tims-data text-xs text-fg-muted">{formatTemperature(hotspot.brightnessTemperature)}</span>
    ),
  },
  {
    key: 'persistence',
    header: 'Persistence',
    hideOnMobile: true,
    render: (hotspot) => (
      <span className="tims-data text-xs text-fg-muted">{hotspot.persistenceDays}d</span>
    ),
  },
  {
    key: 'confidence',
    header: 'Conf.',
    hideOnMobile: true,
    render: (hotspot) => <span className="tims-data text-xs text-fg-muted">{hotspot.confidence}%</span>,
  },
  {
    key: 'risk',
    header: 'Risk',
    className: 'whitespace-nowrap',
    render: (hotspot) => (
      <div className="flex w-[92px] items-center">
        <RiskIndicator score={hotspot.riskScore} level={hotspot.riskLevel} />
      </div>
    ),
  },
];

export function HotspotsClient() {
  const searchParams = useSearchParams();
  const focusId = searchParams.get('focus');

  const { filters, setFilters, setPage, hotspots, meta, loading, error, refetch } = useHotspots({ pageSize: 25 });
  const [selected, setSelected] = useState<Hotspot | null>(null);

  // Deep link from the map: open the matching row's detail panel.
  useEffect(() => {
    if (!focusId) return;
    const match = hotspots.find((hotspot) => hotspot.id === focusId);
    if (match) setSelected(match);
  }, [focusId, hotspots]);

  const activeFilterCount =
    (filters.eventType?.length ?? 0) +
    (filters.riskLevel?.length ?? 0) +
    (filters.persistentOnly ? 1 : 0) +
    (filters.minConfidence ? 1 : 0);

  function toggleEventType(type: EventType) {
    const current = filters.eventType ?? [];
    setFilters({ eventType: current.includes(type) ? current.filter((t) => t !== type) : [...current, type] });
  }

  function toggleRiskLevel(level: RiskLevel) {
    const current = filters.riskLevel ?? [];
    setFilters({ riskLevel: current.includes(level) ? current.filter((l) => l !== level) : [...current, level] });
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-4">
        {/* --- Filter bar --------------------------------------------------- */}
        <Card>
          <div className="flex flex-col gap-3 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-[220px] flex-1">
                <Input
                  name="search"
                  placeholder="Search by ID, region or facility"
                  value={filters.search ?? ''}
                  onChange={(event) => setFilters({ search: event.target.value })}
                  icon={<Search className="size-4" aria-hidden />}
                />
              </div>

              <Select
                name="sortBy"
                value={filters.sortBy ?? 'detectedAt'}
                onChange={(event) => setFilters({ sortBy: event.target.value as typeof filters.sortBy })}
                className="w-auto min-w-[150px]"
              >
                <option value="detectedAt">Newest first</option>
                <option value="riskScore">Highest risk</option>
                <option value="brightnessTemperature">Hottest</option>
                <option value="persistenceDays">Most persistent</option>
                <option value="confidence">Highest confidence</option>
              </Select>

              <label className="inline-flex cursor-pointer select-none items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs text-fg-muted">
                <input
                  type="checkbox"
                  checked={filters.persistentOnly ?? false}
                  onChange={(event) => setFilters({ persistentOnly: event.target.checked || undefined })}
                  className="accent-[var(--tims-primary)]"
                />
                Persistent only
              </label>

              {activeFilterCount > 0 ? (
                <button
                  type="button"
                  onClick={() => setFilters({ eventType: [], riskLevel: [], persistentOnly: undefined, search: '' })}
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <X className="size-3" aria-hidden />
                  Clear ({activeFilterCount})
                </button>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <Filter className="size-3 text-fg-subtle" aria-hidden />
              {EVENT_TYPES.map((type) => {
                const active = filters.eventType?.includes(type) ?? false;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => toggleEventType(type)}
                    aria-pressed={active}
                    className="rounded-md px-2 py-1 text-[11px] font-medium ring-1 ring-inset transition-colors"
                    style={
                      active
                        ? {
                            backgroundColor: `${EVENT_TYPE_META[type].color}1f`,
                            color: EVENT_TYPE_META[type].color,
                            boxShadow: `inset 0 0 0 1px ${EVENT_TYPE_META[type].color}55`,
                          }
                        : undefined
                    }
                  >
                    {EVENT_TYPE_META[type].shortLabel}
                  </button>
                );
              })}

              <span className="mx-1 h-4 w-px bg-line" aria-hidden />

              {RISK_LEVELS.map((level) => {
                const active = filters.riskLevel?.includes(level) ?? false;
                return (
                  <button
                    key={level}
                    type="button"
                    onClick={() => toggleRiskLevel(level)}
                    aria-pressed={active}
                    className="rounded-md px-2 py-1 text-[11px] font-semibold uppercase ring-1 ring-inset transition-colors"
                    style={
                      active
                        ? {
                            backgroundColor: `${RISK_META[level].color}1f`,
                            color: RISK_META[level].color,
                            boxShadow: `inset 0 0 0 1px ${RISK_META[level].color}55`,
                          }
                        : undefined
                    }
                  >
                    {RISK_META[level].label}
                  </button>
                );
              })}
            </div>
          </div>
        </Card>

        {/* --- Table --------------------------------------------------------- */}
        <Card className="overflow-hidden">
          <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
            <h2 className="text-sm font-semibold text-fg">
              {meta ? `${formatNumber(meta.total)} detections` : 'Detections'}
            </h2>
            {loading && hotspots.length > 0 ? (
              <span className="text-[11px] text-fg-subtle">Updating…</span>
            ) : null}
          </header>

          {error ? (
            <ErrorState message={error} onRetry={refetch} />
          ) : (
            <DataTable
              columns={COLUMNS}
              rows={hotspots}
              rowKey={(hotspot) => hotspot.id}
              loading={loading}
              onRowClick={setSelected}
              meta={meta}
              onPageChange={setPage}
              emptyTitle="No detections match these filters"
              emptyDescription="Try clearing the event type or risk filters, or widening the time window."
            />
          )}
        </Card>
      </div>

      {/* --- Detail panel ----------------------------------------------------- */}
      <aside className="xl:sticky xl:top-[84px] xl:self-start">
        {selected ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">Detection detail</h2>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="grid size-6 place-items-center rounded-md text-fg-subtle hover:bg-surface-3"
                aria-label="Close detail panel"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </div>

            <div className="overflow-hidden rounded-xl border border-line">
              <HotspotPopup hotspot={selected} />
            </div>

            <Link
              href={`/dashboard/map?focus=${selected.id}`}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-medium text-fg transition-colors hover:bg-surface-3"
            >
              <MapPin className="size-3.5" aria-hidden />
              Locate on map
            </Link>
          </div>
        ) : (
          <Card>
            <div className="px-5 py-10 text-center">
              <span className="mx-auto grid size-10 place-items-center rounded-full bg-surface-3 text-fg-subtle">
                <MapPin className="size-4" aria-hidden />
              </span>
              <p className="mt-3 text-sm font-medium text-fg">Select a detection</p>
              <p className="mt-1 text-xs text-fg-muted">
                Click any row to inspect coordinates, thermal signature, persistence and the nearest facility.
              </p>
            </div>
          </Card>
        )}

        <p className="mt-3 px-1 text-[11px] leading-relaxed text-fg-subtle">
          Event classes: {EVENT_TYPES.map((type) => humanise(type)).join(', ')}.
        </p>
      </aside>
    </div>
  );
}
