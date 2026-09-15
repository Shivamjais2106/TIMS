'use client';

import { useState } from 'react';
import { BarList } from '@/components/charts';
import { Header } from '@/components/layout/Header';
import { SegmentedControl } from '@/components/ui/Button';
import { Caveat } from '@/components/ui/Indicators';
import { DataTable, Pagination, type Column } from '@/components/ui/DataTable';
import { SearchInput } from '@/components/ui/Input';
import { Panel, PanelBody, PanelHeader } from '@/components/ui/Panel';
import { StatCard, StatRow } from '@/components/ui/StatCard';
import { EmptyState, ErrorState, LoadingState, NoticeBanner } from '@/components/ui/States';
import { useApi } from '@/hooks/useApi';
import { useDebounce } from '@/hooks/useDebounce';
import { useStaggerIn } from '@/hooks/useGsap';
import { useNavOpener } from '../DashboardShell';
import { DISCLAIMERS, EMERGENCY_TYPE_META } from '@/lib/constants';
import { formatCoordinatePair, formatDate } from '@/lib/format';
import { emergencyService } from '@/services';
import type { EmergencyFacility, EmergencyFacilityType } from '@/types';

/** Colour comes from EMERGENCY_TYPE_META so there is a single source for it. */
const TYPE_FILTERS = [
  { value: '', label: 'All' },
  { value: 'FIRE_STATION', label: 'Fire' },
  { value: 'HOSPITAL', label: 'Hospital' },
  { value: 'SCHOOL', label: 'School' },
  { value: 'POLICE', label: 'Police' },
] as const;

/**
 * Emergency resources and exposed receptors.
 *
 * Presented with explicit coverage caveats: OpenStreetMap maps only two fire
 * stations inside the pilot area, which is certainly an undercount, and an
 * analyst relying on "nearest fire station" needs to know that.
 */
export function EmergencyClient() {
  const openNav = useNavOpener();
  const containerRef = useStaggerIn();

  const [page, setPage] = useState(1);
  const [type, setType] = useState('');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 350);

  const facilities = useApi(
    () =>
      emergencyService.list({
        page,
        pageSize: 40,
        type: type || undefined,
        search: debouncedSearch || undefined,
      }),
    [page, type, debouncedSearch],
  );

  const summary = useApi(() => emergencyService.summary(), []);
  const fireStations = useApi(() => emergencyService.fireStations(), []);

  const byType = summary.data?.byType ?? [];
  const count = (key: string) => byType.find((row) => row.type === key)?.count ?? 0;

  const columns: Array<Column<EmergencyFacility>> = [
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
      header: 'Type',
      width: '116px',
      render: (row) => (
        <span
          className="tims-data text-[11px]"
          style={{ color: EMERGENCY_TYPE_META[row.type].color }}
        >
          {EMERGENCY_TYPE_META[row.type].label}
        </span>
      ),
    },
    {
      key: 'capacity',
      header: 'Capacity',
      numeric: true,
      width: '88px',
      render: (row) =>
        row.capacity ? (
          row.capacity
        ) : (
          <span className="text-[10px] text-fg-subtle" title="Not stated by the upstream source">
            not stated
          </span>
        ),
    },
    {
      key: 'phone',
      header: 'Phone',
      numeric: true,
      width: '118px',
      secondary: true,
      render: (row) => row.phone ?? <span className="text-[10px] text-fg-subtle">—</span>,
    },
    {
      key: 'address',
      header: 'Address',
      secondary: true,
      render: (row) => (
        <span className="text-[11px] text-fg-muted">{row.address ?? '—'}</span>
      ),
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
      key: 'verified',
      header: 'Verified',
      numeric: true,
      width: '92px',
      secondary: true,
      render: (row) => (
        <span className="text-[10px] text-fg-subtle">{formatDate(row.lastVerified)}</span>
      ),
    },
  ];

  return (
    <>
      <Header
        title="Emergency resources"
        subtitle={`${summary.data?.total ?? 0} facilities mapped · decision support only`}
        onOpenNav={openNav}
      />

      <div ref={containerRef} className="flex-1 overflow-y-auto">
        <StatRow className="border-b border-line">
          <StatCard
            label="Fire stations"
            value={count('FIRE_STATION')}
            accent="rust"
            footnote="likely undercounted"
          />
          <StatCard label="Hospitals & clinics" value={count('HOSPITAL')} accent="sage" />
          <StatCard label="Schools" value={count('SCHOOL')} accent="warn" footnote="exposed receptors" />
          <StatCard label="Police posts" value={count('POLICE')} accent="neutral" />
        </StatRow>

        <div className="p-3">
          {fireStations.data?.coverageWarning ? (
            <NoticeBanner label="Coverage gap" tone="danger" className="tims-enter mb-3">
              {fireStations.data.coverageWarning}
            </NoticeBanner>
          ) : null}

          <div className="grid gap-3 xl:grid-cols-[1fr_280px]">
            <Panel className="tims-enter">
              <PanelHeader
                label="Facility register"
                meta={`${facilities.data?.meta.total ?? 0} records`}
                actions={
                  <SegmentedControl
                    options={TYPE_FILTERS.map((option) => ({
                      value: option.value,
                      label: option.label,
                      color: option.value
                        ? EMERGENCY_TYPE_META[option.value as EmergencyFacilityType].color
                        : undefined,
                    }))}
                    value={type}
                    onChange={(value) => {
                      setType(value);
                      setPage(1);
                    }}
                  />
                }
              />

              <div className="border-b border-line bg-surface-2 px-3 py-2">
                <SearchInput
                  value={search}
                  onChange={(value) => {
                    setSearch(value);
                    setPage(1);
                  }}
                  placeholder="Search name, operator or address"
                />
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
                <PanelHeader label="By type" />
                <PanelBody>
                  {summary.loading ? (
                    <LoadingState />
                  ) : (
                    <BarList
                      items={byType.map((row) => ({
                        label: EMERGENCY_TYPE_META[row.type].plural,
                        value: row.count,
                        color: EMERGENCY_TYPE_META[row.type].color,
                      }))}
                    />
                  )}
                </PanelBody>
              </Panel>

              <Panel className="tims-enter">
                <PanelHeader label="Mapped fire stations" />
                <PanelBody>
                  {fireStations.loading ? (
                    <LoadingState />
                  ) : (fireStations.data?.items.length ?? 0) === 0 ? (
                    <p className="py-3 text-center text-[11px] text-fg-subtle">
                      None mapped in the pilot area.
                    </p>
                  ) : (
                    <ul className="divide-y divide-line">
                      {fireStations.data?.items.map((station) => (
                        <li key={station.id} className="py-1.5">
                          <p className="truncate text-[11px] text-fg">{station.name}</p>
                          <p className="tims-data text-[10px] text-fg-subtle">
                            {formatCoordinatePair(station.latitude, station.longitude)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </PanelBody>
              </Panel>

              <Panel className="tims-enter">
                <PanelHeader label="Limitations" />
                <PanelBody className="space-y-2">
                  <Caveat>{summary.data?.coverageNote}</Caveat>
                  <Caveat>{DISCLAIMERS.distances}</Caveat>
                  <Caveat>{DISCLAIMERS.population}</Caveat>
                  <Caveat>{DISCLAIMERS.decisionSupport}</Caveat>
                </PanelBody>
              </Panel>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
