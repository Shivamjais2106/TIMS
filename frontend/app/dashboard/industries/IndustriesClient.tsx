'use client';

import { useState } from 'react';
import { BarList } from '@/components/charts';
import { Header } from '@/components/layout/Header';
import { DataTable, Pagination, type Column } from '@/components/ui/DataTable';
import { Caveat, RiskBadge } from '@/components/ui/Indicators';
import { SearchInput, Select } from '@/components/ui/Input';
import { Panel, PanelBody, PanelHeader } from '@/components/ui/Panel';
import { StatCard, StatRow } from '@/components/ui/StatCard';
import { EmptyState, ErrorState, LoadingState, NoticeBanner } from '@/components/ui/States';
import { useApi } from '@/hooks/useApi';
import { useDebounce } from '@/hooks/useDebounce';
import { useStaggerIn } from '@/hooks/useGsap';
import { useNavOpener } from '../DashboardShell';
import { FACILITY_TYPES, FACILITY_TYPE_META } from '@/lib/constants';
import { formatCoordinatePair, shortId } from '@/lib/format';
import { industryService } from '@/services';
import type { IndustrialFacility } from '@/types';

/**
 * Industrial facility register.
 *
 * Sourced entirely from OpenStreetMap. The page states that plainly, because
 * OSM is community-maintained rather than an official register and roughly
 * 85% of the industrial polygons in the pilot area carry no name tag.
 */
export function IndustriesClient() {
  const openNav = useNavOpener();
  const containerRef = useStaggerIn();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const debouncedSearch = useDebounce(search, 350);

  const facilities = useApi(
    () =>
      industryService.list({
        page,
        pageSize: 40,
        search: debouncedSearch || undefined,
        type: type || undefined,
      }),
    [page, debouncedSearch, type],
  );

  const summary = useApi(() => industryService.summary(), []);

  const derivedNames = (facilities.data?.items ?? []).filter((facility) =>
    facility.name.startsWith('Industrial zone '),
  ).length;

  const columns: Array<Column<IndustrialFacility>> = [
    {
      key: 'name',
      header: 'Facility',
      render: (row) => (
        <span className="block">
          <span className="block truncate text-[12px] text-fg">{row.name}</span>
          {row.operator ? (
            <span className="block truncate text-[10px] text-fg-subtle">{row.operator}</span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'type',
      header: 'Class',
      width: '130px',
      render: (row) => (
        <span
          className="tims-data text-[11px]"
          style={{ color: FACILITY_TYPE_META[row.type].color }}
        >
          {FACILITY_TYPE_META[row.type].label}
        </span>
      ),
    },
    {
      key: 'risk',
      header: 'Hazard class',
      width: '110px',
      render: (row) => <RiskBadge level={row.riskLevel} />,
    },
    {
      key: 'detections',
      header: 'Detections',
      numeric: true,
      width: '92px',
      render: (row) => row._count?.hotspots ?? 0,
    },
    {
      key: 'location',
      header: 'Area',
      width: '120px',
      secondary: true,
      render: (row) => <span className="text-[11px] text-fg-muted">{row.location}</span>,
    },
    {
      key: 'position',
      header: 'Position',
      numeric: true,
      width: '150px',
      secondary: true,
      render: (row) => (
        <span className="text-[10px] text-fg-muted">
          {formatCoordinatePair(row.latitude, row.longitude)}
        </span>
      ),
    },
    {
      key: 'osm',
      header: 'OSM id',
      numeric: true,
      width: '100px',
      secondary: true,
      render: (row) =>
        row.osmId ? (
          <a
            href={`https://www.openstreetmap.org/${row.osmId}`}
            target="_blank"
            rel="noreferrer noopener"
            className="text-[10px] text-fg-muted underline-offset-2 hover:text-fg hover:underline"
          >
            {row.osmId}
          </a>
        ) : (
          <span className="text-[10px] text-fg-subtle">analyst entry</span>
        ),
    },
  ];

  return (
    <>
      <Header
        title="Industrial facility register"
        subtitle={`${summary.data?.total ?? 0} sites mapped inside the pilot area`}
        onOpenNav={openNav}
      />

      <div ref={containerRef} className="flex-1 overflow-y-auto">
        <StatRow className="border-b border-line">
          <StatCard
            label="Mapped sites"
            value={summary.data?.total ?? 0}
            accent="rust"
            footnote="from OpenStreetMap"
          />
          <StatCard
            label="Power plants"
            value={summary.data?.byType.find((row) => row.type === 'POWER_PLANT')?.count ?? 0}
            accent="warn"
          />
          <StatCard
            label="Refinery / petrochem"
            value={
              (summary.data?.byType.find((row) => row.type === 'REFINERY')?.count ?? 0) +
              (summary.data?.byType.find((row) => row.type === 'PETROCHEMICAL')?.count ?? 0)
            }
            accent="rust"
          />
          <StatCard
            label="Unclassified zones"
            value={summary.data?.byType.find((row) => row.type === 'OTHER')?.count ?? 0}
            accent="neutral"
            footnote="landuse=industrial"
          />
        </StatRow>

        <div className="p-3">
          <NoticeBanner label="Data source" tone="info" className="tims-enter mb-3">
            Facility geometry comes from OpenStreetMap via the Overpass API — community-maintained,
            not an official register. MPPCB and Invest MP publish consent registers as documents
            rather than geocoded feeds, so no official facility coordinates are loaded. Unnamed{' '}
            <span className="tims-data">landuse=industrial</span> polygons are kept with a derived
            label because they still carry real geometry that the distance-to-facility feature needs.
          </NoticeBanner>

          <div className="grid gap-3 xl:grid-cols-[1fr_280px]">
            <Panel className="tims-enter">
              <PanelHeader
                label="Facility register"
                meta={`${facilities.data?.meta.total ?? 0} records`}
              />

              <div className="flex flex-wrap items-end gap-2 border-b border-line bg-surface-2 px-3 py-2">
                <SearchInput
                  value={search}
                  onChange={(value) => {
                    setSearch(value);
                    setPage(1);
                  }}
                  placeholder="Search name, operator or area"
                  className="min-w-[200px] flex-1"
                />
                <Select
                  label="Class"
                  value={type}
                  onChange={(event) => {
                    setType(event.target.value);
                    setPage(1);
                  }}
                  className="w-[170px]"
                >
                  <option value="">All classes</option>
                  {FACILITY_TYPES.map((key) => (
                    <option key={key} value={key}>
                      {FACILITY_TYPE_META[key].label}
                    </option>
                  ))}
                </Select>
              </div>

              {facilities.loading && !facilities.data ? (
                <LoadingState label="Loading register" />
              ) : facilities.error ? (
                <div className="p-3">
                  <ErrorState message={facilities.error} onRetry={facilities.refetch} />
                </div>
              ) : (facilities.data?.items.length ?? 0) === 0 ? (
                <EmptyState
                  title="No facilities match"
                  detail="Run the OpenStreetMap sync if the register is empty."
                />
              ) : (
                <>
                  <DataTable
                    columns={columns}
                    rows={facilities.data?.items ?? []}
                    rowKey={(row) => row.id}
                  />
                  {facilities.data?.meta ? (
                    <Pagination
                      page={facilities.data.meta.page}
                      pageSize={facilities.data.meta.pageSize}
                      total={facilities.data.meta.total}
                      totalPages={facilities.data.meta.totalPages}
                      onPageChange={setPage}
                    />
                  ) : null}
                </>
              )}
            </Panel>

            <div className="space-y-3">
              <Panel className="tims-enter">
                <PanelHeader label="By class" />
                <PanelBody>
                  {summary.loading ? (
                    <LoadingState />
                  ) : (
                    <BarList
                      items={(summary.data?.byType ?? []).map((row) => ({
                        label: FACILITY_TYPE_META[row.type].label,
                        value: row.count,
                        color: FACILITY_TYPE_META[row.type].color,
                      }))}
                    />
                  )}
                </PanelBody>
              </Panel>

              <Panel className="tims-enter">
                <PanelHeader label="Most detections nearby" />
                <PanelBody>
                  {summary.loading ? (
                    <LoadingState />
                  ) : (summary.data?.topFacilities.length ?? 0) === 0 ? (
                    <p className="py-3 text-center text-[11px] text-fg-subtle">
                      No facility has a linked detection yet.
                    </p>
                  ) : (
                    <ul className="divide-y divide-line">
                      {summary.data?.topFacilities.slice(0, 8).map((facility) => (
                        <li key={facility.id} className="flex items-baseline gap-2 py-1.5">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[11px] text-fg">
                              {facility.name}
                            </span>
                            <span className="block truncate text-[10px] text-fg-subtle">
                              {FACILITY_TYPE_META[facility.type].label}
                            </span>
                          </span>
                          <span className="tims-data flex-none text-[11px] text-fg-muted">
                            {facility.hotspotCount}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Caveat className="mt-2">
                    A detection near a facility does not establish that the facility caused it.
                  </Caveat>
                </PanelBody>
              </Panel>

              {derivedNames > 0 ? (
                <Panel className="tims-enter">
                  <PanelHeader label="Naming" />
                  <PanelBody>
                    <p className="text-[11px] leading-relaxed text-fg-muted">
                      <span className="tims-data text-fg">{derivedNames}</span> of the{' '}
                      <span className="tims-data text-fg">
                        {facilities.data?.items.length ?? 0}
                      </span>{' '}
                      rows on this page have a derived label rather than an OSM{' '}
                      <span className="tims-data">name</span> tag.
                    </p>
                  </PanelBody>
                </Panel>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
