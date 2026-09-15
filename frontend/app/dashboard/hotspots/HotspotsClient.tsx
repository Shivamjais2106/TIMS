'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Header } from '@/components/layout/Header';
import { SegmentedControl } from '@/components/ui/Button';
import { DataTable, Pagination, type Column } from '@/components/ui/DataTable';
import {
  ClassBadge,
  PersistenceBadge,
  ProvenanceBadge,
  RiskMeter,
} from '@/components/ui/Indicators';
import { SearchInput, Select } from '@/components/ui/Input';
import { Panel, PanelHeader } from '@/components/ui/Panel';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { useHotspots } from '@/hooks/useHotspots';
import { useTheme } from '@/hooks/useTheme';
import { useNavOpener } from '../DashboardShell';
import {
  describeFirmsProduct,
  riskColor,
  THERMAL_CLASSES,
  THERMAL_CLASS_META,
} from '@/lib/constants';
import {
  formatCoordinatePair,
  formatDateTimeShort,
  formatDistance,
  formatPower,
  formatTemperature,
} from '@/lib/format';
import type { Hotspot, RiskLevel } from '@/types';

const RISK_OPTIONS = [
  { value: 'all', label: 'All risk' },
  { value: 'CRITICAL', label: 'Critical' },
  { value: 'HIGH', label: 'High' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'LOW', label: 'Low' },
] as const;

/**
 * Detection register.
 *
 * Sorting is server-side (the API takes sortBy/sortOrder) so ordering applies
 * across the whole result set rather than only the current page — sorting a
 * single page of a 1,300-row table would be actively misleading.
 */
export function HotspotsClient() {
  const router = useRouter();
  const openNav = useNavOpener();
  const { theme } = useTheme();

  const { filters, setFilters, setPage, hotspots, meta, loading, error, refetch } = useHotspots({
    pageSize: 40,
    sortBy: 'detectedAt',
    sortOrder: 'desc',
  });

  const [riskFilter, setRiskFilter] = useState<string>('all');

  function onRiskChange(value: string) {
    setRiskFilter(value);
    setFilters({ riskLevel: value === 'all' ? undefined : [value as RiskLevel] });
  }

  function onSort(key: string) {
    const nextOrder = filters.sortBy === key && filters.sortOrder === 'desc' ? 'asc' : 'desc';
    setFilters({
      sortBy: key as typeof filters.sortBy,
      sortOrder: nextOrder,
      page: filters.page,
    });
  }

  const columns: Array<Column<Hotspot>> = [
    {
      key: 'risk',
      header: 'Risk',
      sortKey: 'riskScore',
      width: '104px',
      render: (row) => <RiskMeter score={row.riskScore} level={row.riskLevel} />,
    },
    {
      key: 'class',
      header: 'Classification',
      render: (row) => (
        <span className="flex flex-wrap items-center gap-1">
          <ClassBadge thermalClass={row.mlClass} compact />
          <ProvenanceBadge
            path={row.classificationPath}
            confidence={row.mlConfidence}
            modelVersion={row.modelVersion}
          />
        </span>
      ),
    },
    {
      key: 'detectedAt',
      header: 'Detected (IST)',
      sortKey: 'detectedAt',
      numeric: true,
      width: '112px',
      render: (row) => formatDateTimeShort(row.detectedAt),
    },
    {
      key: 'frp',
      header: 'FRP',
      numeric: true,
      width: '78px',
      render: (row) => formatPower(row.frp),
    },
    {
      key: 'brightness',
      header: 'Brightness',
      sortKey: 'brightnessTemperature',
      numeric: true,
      width: '86px',
      secondary: true,
      render: (row) => formatTemperature(row.brightnessTemperature),
    },
    {
      key: 'confidence',
      header: 'Conf.',
      sortKey: 'confidence',
      numeric: true,
      width: '58px',
      render: (row) => `${row.confidence}%`,
    },
    {
      key: 'persistence',
      header: 'Persist',
      sortKey: 'persistenceDays',
      numeric: true,
      width: '66px',
      render: (row) => <PersistenceBadge days={row.persistenceDays} />,
    },
    {
      key: 'distance',
      header: 'To industry',
      numeric: true,
      width: '92px',
      render: (row) =>
        row.distanceToFacilityM != null ? formatDistance(row.distanceToFacilityM) : '—',
    },
    {
      key: 'product',
      header: 'Product',
      width: '132px',
      secondary: true,
      render: (row) => {
        const product = describeFirmsProduct(row.firmsProduct);
        return (
          <span
            className="tims-data text-[10px] text-fg-muted"
            title={
              product.latency === 'archive'
                ? 'Read from the FIRMS archive — historical, not near-real-time.'
                : 'Near-real-time FIRMS product.'
            }
          >
            {product.label}
          </span>
        );
      },
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
  ];

  return (
    <>
      <Header
        title="Hotspot register"
        subtitle={`${meta?.total ?? 0} detections inside the Bhopal district geofence`}
        onOpenNav={openNav}
      />

      <div className="flex-1 overflow-y-auto p-3">
        <Panel>
          <PanelHeader
            label="Detection register"
            meta={loading ? 'loading' : `${meta?.total ?? 0} records`}
            actions={
              <SegmentedControl
                options={RISK_OPTIONS.map((option) => ({
                  value: option.value,
                  label: option.label,
                  color: option.value === 'all' ? undefined : riskColor(option.value as RiskLevel, theme),
                }))}
                value={riskFilter}
                onChange={onRiskChange}
              />
            }
          />

          {/* --- Filter bar ------------------------------------------- */}
          <div className="flex flex-wrap items-end gap-2 border-b border-line bg-surface-2 px-3 py-2">
            <SearchInput
              value={filters.search ?? ''}
              onChange={(value) => setFilters({ search: value })}
              placeholder="Search facility, region or id"
              className="min-w-[200px] flex-1"
            />

            <Select
              label="Classification"
              value={filters.eventType?.[0] ?? ''}
              onChange={(event) => {
                // The API filters on the legacy EventType taxonomy, so the
                // hedged class shown in the UI is mapped back to it here.
                const value = event.target.value;
                const mapping: Record<string, string> = {
                  POSSIBLE_INDUSTRIAL_FIRE: 'INDUSTRIAL_FIRE',
                  POSSIBLE_PERSISTENT_THERMAL_SOURCE: 'GAS_FLARE',
                  POSSIBLE_VEGETATION_FIRE: 'FOREST_FIRE',
                  POSSIBLE_AGRICULTURAL_BURN: 'AGRICULTURAL_FIRE',
                  UNKNOWN: 'OTHER',
                };
                setFilters({
                  eventType: value ? [mapping[value] as never] : undefined,
                });
              }}
              className="w-[190px]"
            >
              <option value="">All classes</option>
              {THERMAL_CLASSES.map((key) => (
                <option key={key} value={key}>
                  {THERMAL_CLASS_META[key].label}
                </option>
              ))}
            </Select>

            <Select
              label="Min risk score"
              value={String(filters.minRiskScore ?? '')}
              onChange={(event) =>
                setFilters({
                  minRiskScore: event.target.value ? Number(event.target.value) : undefined,
                })
              }
              className="w-[120px]"
            >
              <option value="">Any</option>
              <option value="31">31+ medium</option>
              <option value="61">61+ high</option>
              <option value="81">81+ critical</option>
            </Select>

            <label className="flex items-center gap-1.5 pb-1.5">
              <input
                type="checkbox"
                checked={filters.persistentOnly ?? false}
                onChange={(event) => setFilters({ persistentOnly: event.target.checked || undefined })}
                className="size-3 accent-rust"
              />
              <span className="text-[11px] text-fg-muted">Persistent only</span>
            </label>
          </div>

          {loading && hotspots.length === 0 ? (
            <LoadingState label="Loading register" />
          ) : error ? (
            <div className="p-3">
              <ErrorState message={error} onRetry={refetch} />
            </div>
          ) : hotspots.length === 0 ? (
            <EmptyState
              title="No detections match these filters"
              detail="Try widening the risk filter or clearing the search term."
            />
          ) : (
            <>
              <DataTable
                columns={columns}
                rows={hotspots}
                rowKey={(row) => row.id}
                onRowClick={(row) => router.push(`/dashboard/hotspots/${row.id}`)}
                sortBy={filters.sortBy}
                sortOrder={filters.sortOrder}
                onSort={onSort}
              />
              {meta ? (
                <Pagination
                  page={meta.page}
                  pageSize={meta.pageSize}
                  total={meta.total}
                  totalPages={meta.totalPages}
                  onPageChange={setPage}
                />
              ) : null}
            </>
          )}
        </Panel>
      </div>
    </>
  );
}
