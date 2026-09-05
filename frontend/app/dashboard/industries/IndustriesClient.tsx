'use client';

import { Building2, MapPin, Search, X } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { RiskBadge } from '@/components/ui/Badge';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import { Input, Select } from '@/components/ui/Input';
import { LoadingState } from '@/components/ui/LoadingState';
import { useApi } from '@/hooks/useApi';
import { useDebounce } from '@/hooks/useDebounce';
import { EVENT_TYPE_META, FACILITY_TYPES, FACILITY_TYPE_META, RISK_LEVELS } from '@/lib/constants';
import { formatCoordinatePair, formatDateTime, formatDistance, formatNumber } from '@/lib/format';
import { industryService, type IndustryFilters } from '@/services/industry.service';
import type { FacilityType, IndustrialFacility, RiskLevel } from '@/types';

const COLUMNS: Column<IndustrialFacility>[] = [
  {
    key: 'name',
    header: 'Facility',
    render: (facility) => {
      const meta = FACILITY_TYPE_META[facility.type];
      return (
        <div className="flex items-center gap-3">
          <span
            className="grid size-7 shrink-0 place-items-center rounded-md text-[10px] font-bold text-white"
            style={{ backgroundColor: meta.color }}
            aria-hidden
          >
            {meta.glyph}
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-fg">{facility.name}</p>
            <p className="truncate text-[10px] text-fg-subtle">{facility.operator ?? meta.label}</p>
          </div>
        </div>
      );
    },
  },
  {
    key: 'type',
    header: 'Type',
    hideOnMobile: true,
    render: (facility) => <span className="text-xs text-fg-muted">{FACILITY_TYPE_META[facility.type].label}</span>,
  },
  {
    key: 'location',
    header: 'Location',
    hideOnMobile: true,
    render: (facility) => (
      <div className="min-w-0">
        <p className="truncate text-xs text-fg">{facility.location}</p>
        <p className="tims-data truncate text-[10px] text-fg-subtle">
          {formatCoordinatePair(facility.latitude, facility.longitude)}
        </p>
      </div>
    ),
  },
  {
    key: 'events',
    header: 'Detections',
    hideOnMobile: true,
    render: (facility) => (
      <span className="tims-data text-xs text-fg-muted">{formatNumber(facility._count?.hotspots ?? 0)}</span>
    ),
  },
  {
    key: 'risk',
    header: 'Risk',
    render: (facility) => <RiskBadge level={facility.riskLevel} />,
  },
];

export function IndustriesClient() {
  const searchParams = useSearchParams();
  const focusId = searchParams.get('focus');

  const [filters, setFilters] = useState<IndustryFilters>({
    page: 1,
    pageSize: 20,
    withHotspotCount: true,
    sortBy: 'name',
    sortOrder: 'asc',
  });
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(focusId);

  const debouncedSearch = useDebounce(search, 350);

  const list = useApi(
    () => industryService.list({ ...filters, search: debouncedSearch || undefined }),
    [JSON.stringify(filters), debouncedSearch],
  );

  const detail = useApi(
    () => (selectedId ? industryService.getById(selectedId) : Promise.resolve(null)),
    [selectedId],
  );

  useEffect(() => {
    setSelectedId(focusId);
  }, [focusId]);

  function update(patch: Partial<IndustryFilters>) {
    setFilters((current) => ({ ...current, ...patch, page: patch.page ?? 1 }));
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-4">
        <Card>
          <div className="flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-[220px] flex-1">
              <Input
                name="facility-search"
                placeholder="Search by name, location or operator"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                icon={<Search className="size-4" aria-hidden />}
              />
            </div>

            <Select
              name="type"
              value={filters.type ?? ''}
              onChange={(event) => update({ type: (event.target.value || undefined) as FacilityType | undefined })}
              className="w-auto min-w-[160px]"
            >
              <option value="">All facility types</option>
              {FACILITY_TYPES.map((type) => (
                <option key={type} value={type}>
                  {FACILITY_TYPE_META[type].label}
                </option>
              ))}
            </Select>

            <Select
              name="riskLevel"
              value={filters.riskLevel ?? ''}
              onChange={(event) => update({ riskLevel: (event.target.value || undefined) as RiskLevel | undefined })}
              className="w-auto min-w-[140px]"
            >
              <option value="">All risk levels</option>
              {RISK_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level.charAt(0) + level.slice(1).toLowerCase()}
                </option>
              ))}
            </Select>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader
            title={list.data ? `${formatNumber(list.data.meta.total)} facilities` : 'Facilities'}
            description="Sites monitored for thermal activity"
          />
          {list.error ? (
            <ErrorState message={list.error} onRetry={list.refetch} />
          ) : (
            <DataTable
              columns={COLUMNS}
              rows={list.data?.items ?? []}
              rowKey={(facility) => facility.id}
              loading={list.loading}
              onRowClick={(facility) => setSelectedId(facility.id)}
              meta={list.data?.meta}
              onPageChange={(page) => setFilters((current) => ({ ...current, page }))}
              emptyTitle="No facilities match these filters"
              emptyDescription="Run the OSM sync job or relax the filters above."
            />
          )}
        </Card>
      </div>

      {/* --- Facility profile -------------------------------------------------- */}
      <aside className="xl:sticky xl:top-[84px] xl:self-start">
        {!selectedId ? (
          <Card>
            <EmptyState
              icon={Building2}
              title="Select a facility"
              description="Open any site to see its coordinates, hazard rating and the thermal detections attributed to it."
              minHeight={240}
            />
          </Card>
        ) : detail.loading ? (
          <Card>
            <LoadingState label="Loading facility" minHeight={240} />
          </Card>
        ) : detail.error ? (
          <Card>
            <ErrorState message={detail.error} onRetry={detail.refetch} />
          </Card>
        ) : detail.data ? (
          <Card className="overflow-hidden">
            <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
              <div className="flex min-w-0 items-start gap-3">
                <span
                  className="grid size-9 shrink-0 place-items-center rounded-lg text-xs font-bold text-white"
                  style={{ backgroundColor: FACILITY_TYPE_META[detail.data.type].color }}
                  aria-hidden
                >
                  {FACILITY_TYPE_META[detail.data.type].glyph}
                </span>
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold text-fg">{detail.data.name}</h2>
                  <p className="truncate text-[11px] text-fg-subtle">
                    {FACILITY_TYPE_META[detail.data.type].label} · {detail.data.location}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="grid size-6 shrink-0 place-items-center rounded-md text-fg-subtle hover:bg-surface-3"
                aria-label="Close facility profile"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </header>

            <CardBody className="space-y-4">
              <dl className="grid grid-cols-2 gap-3">
                <div>
                  <dt className="text-[10px] uppercase tracking-wide text-fg-subtle">Hazard rating</dt>
                  <dd className="mt-1">
                    <RiskBadge level={detail.data.riskLevel} />
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-wide text-fg-subtle">Detections</dt>
                  <dd className="tims-data mt-1 text-sm font-semibold text-fg">
                    {formatNumber(detail.data._count?.hotspots ?? 0)}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-[10px] uppercase tracking-wide text-fg-subtle">Coordinates</dt>
                  <dd className="tims-data mt-1 text-xs text-fg">
                    {formatCoordinatePair(detail.data.latitude, detail.data.longitude)}
                  </dd>
                </div>
                {detail.data.operator ? (
                  <div className="col-span-2">
                    <dt className="text-[10px] uppercase tracking-wide text-fg-subtle">Operator</dt>
                    <dd className="mt-1 text-xs text-fg">{detail.data.operator}</dd>
                  </div>
                ) : null}
                <div className="col-span-2">
                  <dt className="text-[10px] uppercase tracking-wide text-fg-subtle">Registered</dt>
                  <dd className="mt-1 text-xs text-fg-muted">{formatDateTime(detail.data.createdAt)}</dd>
                </div>
              </dl>

              <div>
                <p className="mb-2 text-[10px] uppercase tracking-wide text-fg-subtle">Recent detections</p>
                {detail.data.hotspots.length === 0 ? (
                  <p className="text-xs text-fg-muted">No thermal detections attributed to this site yet.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {detail.data.hotspots.map((hotspot) => (
                      <li
                        key={hotspot.id}
                        className="flex items-center gap-2.5 rounded-lg border border-line bg-surface-2 px-2.5 py-2"
                      >
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{ backgroundColor: EVENT_TYPE_META[hotspot.eventType].color }}
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[11px] font-medium text-fg">
                            {EVENT_TYPE_META[hotspot.eventType].label}
                          </p>
                          <p className="tims-data truncate text-[10px] text-fg-subtle">
                            {formatDateTime(hotspot.detectedAt)}
                            {hotspot.distanceToFacilityM != null
                              ? ` · ${formatDistance(hotspot.distanceToFacilityM)}`
                              : ''}
                          </p>
                        </div>
                        <span className="tims-data shrink-0 text-[11px] font-semibold text-fg-muted">
                          {hotspot.riskScore.toFixed(0)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <Link
                href={`/dashboard/map?focus=${detail.data.hotspots[0]?.id ?? ''}`}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-medium text-fg transition-colors hover:bg-surface-3"
              >
                <MapPin className="size-3.5" aria-hidden />
                Show on map
              </Link>
            </CardBody>
          </Card>
        ) : null}
      </aside>
    </div>
  );
}
