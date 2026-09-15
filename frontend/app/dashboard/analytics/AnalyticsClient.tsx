'use client';

import { useState } from 'react';
import { BarList, StackedBar, TrendChart } from '@/components/charts';
import { Header } from '@/components/layout/Header';
import { SegmentedControl } from '@/components/ui/Button';
import { Caveat } from '@/components/ui/Indicators';
import { Panel, PanelBody, PanelHeader, Readout, ReadoutList } from '@/components/ui/Panel';
import { StatCard, StatRow } from '@/components/ui/StatCard';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { useApi } from '@/hooks/useApi';
import { useTheme } from '@/hooks/useTheme';
import { useStaggerIn } from '@/hooks/useGsap';
import { useNavOpener } from '../DashboardShell';
import {
  classColor,
  DISCLAIMERS,
  riskColor,
  RISK_LEVELS,
  RISK_META,
  SOURCE_LABELS,
} from '@/lib/constants';
import { formatDecimal, formatTemperature, humanise } from '@/lib/format';
import { analyticsService } from '@/services';
import type { ThermalClass } from '@/types';

/**
 * Colour for the legacy EventType taxonomy the analytics endpoints aggregate on.
 *
 * Mapped onto the hedged ThermalClass palette so the analytics charts and the
 * class badges elsewhere cannot disagree about what "industrial" looks like.
 */
function eventTypeColor(eventType: string, theme: 'dark' | 'light'): string {
  const mapping: Record<string, ThermalClass> = {
    INDUSTRIAL_FIRE: 'POSSIBLE_INDUSTRIAL_FIRE',
    GAS_FLARE: 'POSSIBLE_PERSISTENT_THERMAL_SOURCE',
    FOREST_FIRE: 'POSSIBLE_VEGETATION_FIRE',
    AGRICULTURAL_FIRE: 'POSSIBLE_AGRICULTURAL_BURN',
  };
  return classColor(mapping[eventType] ?? 'UNKNOWN', theme);
}

const WINDOWS = [
  { value: '1', label: '24 h' },
  { value: '7', label: '7 d' },
  { value: '30', label: '30 d' },
  { value: '90', label: '90 d' },
] as const;

/**
 * Trends, distributions and derived insights.
 *
 * Every figure comes from the analytics endpoints, which aggregate in
 * PostgreSQL rather than in the browser, so the numbers reflect the whole
 * dataset and not just a fetched page.
 */
export function AnalyticsClient() {
  const openNav = useNavOpener();
  const containerRef = useStaggerIn();
  const { theme, palette } = useTheme();
  const [windowDays, setWindowDays] = useState<string>('30');

  const days = Number(windowDays);
  const summary = useApi(() => analyticsService.summary(days), [days]);
  const trends = useApi(() => analyticsService.trends(days), [days]);
  const categories = useApi(() => analyticsService.categories(days), [days]);

  const stats = summary.data;
  const breakdown = categories.data;

  const industrialShare =
    breakdown && breakdown.byEventType.length > 0
      ? breakdown.byEventType
          .filter((row) => row.eventType === 'INDUSTRIAL_FIRE' || row.eventType === 'GAS_FLARE')
          .reduce((total, row) => total + row.share, 0)
      : 0;

  return (
    <>
      <Header
        title="Analytics"
        subtitle={`Trends and distributions over the last ${days} day(s)`}
        onOpenNav={openNav}
        actions={
          <SegmentedControl
            options={WINDOWS.map((option) => ({ value: option.value, label: option.label }))}
            value={windowDays}
            onChange={setWindowDays}
          />
        }
      />

      <div ref={containerRef} className="flex-1 overflow-y-auto">
        {summary.loading && !stats ? (
          <LoadingState label="Loading analytics" />
        ) : summary.error ? (
          <div className="p-3">
            <ErrorState message={summary.error} onRetry={summary.refetch} />
          </div>
        ) : stats ? (
          <StatRow className="border-b border-line">
            <StatCard
              label="Total detections"
              value={stats.totalThermalEvents.value}
              delta={stats.totalThermalEvents.changePercent}
              accent="neutral"
            />
            <StatCard
              label="Industrial signature"
              value={stats.industrialFireEvents.value}
              delta={stats.industrialFireEvents.changePercent}
              accent="rust"
            />
            <StatCard
              label="Persistent sources"
              value={stats.persistentThermalSources.value}
              delta={stats.persistentThermalSources.changePercent}
              accent="warn"
              footnote="3+ distinct days"
            />
            <StatCard
              label="Mean risk score"
              value={stats.averageRiskScore}
              decimals={1}
              accent="sage"
              footnote="of 100"
            />
          </StatRow>
        ) : null}

        <div className="space-y-3 p-3">
          {/* --- Trend ------------------------------------------------ */}
          <Panel className="tims-enter">
            <PanelHeader
              label="Detection trend"
              title="Detections per day"
              meta={`${trends.data?.length ?? 0} points`}
            />
            <PanelBody>
              {trends.loading ? (
                <LoadingState />
              ) : trends.error ? (
                <ErrorState message={trends.error} onRetry={trends.refetch} />
              ) : (
                <TrendChart data={trends.data ?? []} height={230} />
              )}
            </PanelBody>
          </Panel>

          <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {/* --- Risk distribution ------------------------------- */}
            <Panel className="tims-enter">
              <PanelHeader label="Risk distribution" />
              <PanelBody>
                {stats ? (
                  <>
                    <StackedBar
                      segments={RISK_LEVELS.map((level) => ({
                        label: RISK_META[level].label,
                        value:
                          stats.riskDistribution.find((row) => row.riskLevel === level)?.count ?? 0,
                        color: riskColor(level, theme),
                      }))}
                    />
                    <Caveat className="mt-2">{DISCLAIMERS.risk}</Caveat>
                  </>
                ) : (
                  <LoadingState />
                )}
              </PanelBody>
            </Panel>

            {/* --- By class ---------------------------------------- */}
            <Panel className="tims-enter">
              <PanelHeader label="By classification" />
              <PanelBody>
                {breakdown ? (
                  <BarList
                    items={breakdown.byEventType.map((row) => ({
                      label: humanise(row.eventType),
                      value: row.count,
                      color: eventTypeColor(row.eventType, theme),
                      note: `${row.share.toFixed(1)}%`,
                      title: `Mean risk ${row.avgRiskScore.toFixed(1)}, mean brightness ${row.avgBrightnessTemperature.toFixed(0)} K`,
                    }))}
                  />
                ) : (
                  <LoadingState />
                )}
              </PanelBody>
            </Panel>

            {/* --- By satellite ----------------------------------- */}
            <Panel className="tims-enter">
              <PanelHeader label="By satellite product" />
              <PanelBody>
                {breakdown ? (
                  <>
                    <BarList
                      items={breakdown.bySource.map((row) => ({
                        label: SOURCE_LABELS[row.source] ?? row.source,
                        value: row.count,
                        color: palette.fgMuted,
                      }))}
                    />
                    <Caveat className="mt-2">
                      VIIRS resolves at 375 m and MODIS at 1 km, so VIIRS dominates the count for the
                      same physical activity.
                    </Caveat>
                  </>
                ) : (
                  <LoadingState />
                )}
              </PanelBody>
            </Panel>

            {/* --- Regional --------------------------------------- */}
            <Panel className="tims-enter">
              <PanelHeader label="Regional breakdown" />
              <PanelBody>
                {breakdown ? (
                  breakdown.byRegion.length === 0 ? (
                    <p className="py-3 text-center text-[11px] text-fg-subtle">
                      No regional labels recorded.
                    </p>
                  ) : (
                    <>
                      <BarList
                        items={breakdown.byRegion.map((row) => ({
                          label: row.region,
                          value: row.count,
                          color: palette.riskHigh,
                          note: `${row.highRisk} high`,
                        }))}
                      />
                      <Caveat className="mt-2">
                        The pilot covers one district, so every detection carries the same regional
                        label. This panel is what scales when the pilot widens beyond Bhopal.
                      </Caveat>
                    </>
                  )
                ) : (
                  <LoadingState />
                )}
              </PanelBody>
            </Panel>

            {/* --- By facility class ------------------------------ */}
            <Panel className="tims-enter">
              <PanelHeader label="Detections by facility class" />
              <PanelBody>
                {breakdown ? (
                  <BarList
                    items={breakdown.byFacilityType.map((row) => ({
                      label: humanise(row.facilityType),
                      value: row.hotspotCount,
                      color: palette.rustDim,
                      note: `${row.count} sites`,
                    }))}
                    emptyMessage="No detections linked to a facility class"
                  />
                ) : (
                  <LoadingState />
                )}
              </PanelBody>
            </Panel>

            {/* --- Summary readouts ------------------------------- */}
            <Panel className="tims-enter">
              <PanelHeader label="Window summary" />
              <PanelBody className="py-1">
                <ReadoutList>
                  <Readout label="Window" value={`${stats?.windowDays ?? days} days`} />
                  <Readout
                    label="Mean risk score"
                    value={formatDecimal(stats?.averageRiskScore)}
                  />
                  <Readout
                    label="Mean brightness"
                    value={formatTemperature(stats?.averageBrightnessTemperature)}
                  />
                  <Readout
                    label="Industrial share"
                    value={`${industrialShare.toFixed(1)}%`}
                  />
                  <Readout label="High-risk events" value={String(stats?.highRiskEvents.value ?? 0)} />
                  <Readout label="Unread alerts" value={String(stats?.unreadAlerts ?? 0)} />
                  <Readout
                    label="Monitored facilities"
                    value={String(stats?.monitoredFacilities ?? 0)}
                  />
                </ReadoutList>
              </PanelBody>
            </Panel>
          </div>

          {/* --- Insights -------------------------------------------- */}
          <Panel className="tims-enter">
            <PanelHeader label="Key insights" title="Read with the caveats" />
            <PanelBody>
              <ul className="space-y-1.5 text-[11px] leading-relaxed text-fg-muted">
                <li>
                  <span className="tims-data text-fg">{industrialShare.toFixed(1)}%</span> of
                  detections in this window carry a possible industrial signature. That is an
                  inference from proximity and recurrence, not a confirmed cause.
                </li>
                <li>
                  <span className="tims-data text-fg">
                    {stats?.persistentThermalSources.value ?? 0}
                  </span>{' '}
                  sources recurred on three or more days. Persistence indicates a fixed source; it
                  does not by itself indicate an industrial one.
                </li>
                <li>
                  Mean brightness temperature is{' '}
                  <span className="tims-data text-fg">
                    {formatTemperature(stats?.averageBrightnessTemperature)}
                  </span>
                  . Values in the 300–320 K band are typical of smouldering or partially-filled
                  pixels rather than open flame.
                </li>
                <li>
                  Detection counts track satellite overpass timing as much as fire activity. A gap in
                  the trend line can mean cloud cover or a missed pass, not an absence of burning.
                </li>
              </ul>
              <Caveat className="mt-3">{DISCLAIMERS.classification}</Caveat>
            </PanelBody>
          </Panel>
        </div>
      </div>
    </>
  );
}
