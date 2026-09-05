'use client';

import { Activity, Flame, Gauge, Thermometer } from 'lucide-react';
import { useState } from 'react';
import { CategoryChart, FacilityChart, RegionChart, RiskDistributionChart, TrendChart } from '@/components/charts';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import { LoadingState, StatSkeleton } from '@/components/ui/LoadingState';
import { StatCard } from '@/components/ui/StatCard';
import { useApi } from '@/hooks/useApi';
import { EVENT_TYPE_META, RISK_META } from '@/lib/constants';
import { formatDecimal, formatNumber, formatPercent, formatTemperature } from '@/lib/format';
import { analyticsService } from '@/services/analytics.service';

const WINDOWS = [7, 30, 90, 180] as const;
const INTERVALS = [
  { value: 'day', label: 'Daily' },
  { value: 'week', label: 'Weekly' },
  { value: 'month', label: 'Monthly' },
] as const;

export function AnalyticsClient() {
  const [days, setDays] = useState<number>(30);
  const [interval, setInterval] = useState<'day' | 'week' | 'month'>('day');

  const summary = useApi(() => analyticsService.summary(days), [days]);
  const trends = useApi(() => analyticsService.trends(days, interval), [days, interval]);
  const categories = useApi(() => analyticsService.categories(days), [days]);

  return (
    <div className="space-y-5">
      {/* --- Controls -------------------------------------------------------- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-line bg-surface p-0.5">
          {WINDOWS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setDays(option)}
              aria-pressed={days === option}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                days === option ? 'bg-primary/12 text-primary' : 'text-fg-muted hover:text-fg'
              }`}
            >
              {option}d
            </button>
          ))}
        </div>

        <div className="inline-flex rounded-lg border border-line bg-surface p-0.5">
          {INTERVALS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setInterval(option.value)}
              aria-pressed={interval === option.value}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                interval === option.value ? 'bg-primary/12 text-primary' : 'text-fg-muted hover:text-fg'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* --- Headline metrics ------------------------------------------------- */}
      {summary.loading && !summary.data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <StatSkeleton key={index} />
          ))}
        </div>
      ) : summary.error ? (
        <Card>
          <ErrorState message={summary.error} onRetry={summary.refetch} />
        </Card>
      ) : summary.data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Detections"
            value={summary.data.totalThermalEvents.value}
            delta={summary.data.totalThermalEvents}
            icon={Activity}
            accent="#22d3ee"
            caption={`last ${days} days`}
          />
          <StatCard
            label="Industrial share"
            value={summary.data.industrialFireEvents.value}
            delta={summary.data.industrialFireEvents}
            icon={Flame}
            accent={EVENT_TYPE_META.INDUSTRIAL_FIRE.color}
            caption={
              summary.data.totalThermalEvents.value > 0
                ? formatPercent(
                    (summary.data.industrialFireEvents.value / summary.data.totalThermalEvents.value) * 100,
                  ) + ' of all events'
                : undefined
            }
          />
          <StatCard
            label="Average risk score"
            value={summary.data.averageRiskScore}
            icon={Gauge}
            accent={RISK_META.HIGH.color}
            caption="out of 100"
          />
          <StatCard
            label="Avg brightness"
            value={Math.round(summary.data.averageBrightnessTemperature)}
            icon={Thermometer}
            accent={EVENT_TYPE_META.GAS_FLARE.color}
            caption="kelvin"
            higherIsWorse={false}
          />
        </div>
      ) : null}

      {/* --- Trend ------------------------------------------------------------ */}
      <Card>
        <CardHeader
          title="Thermal events trend"
          description={`${INTERVALS.find((option) => option.value === interval)?.label} detections over the last ${days} days`}
        />
        <CardBody>
          {trends.loading && !trends.data ? (
            <LoadingState minHeight={300} />
          ) : trends.error ? (
            <ErrorState message={trends.error} onRetry={trends.refetch} />
          ) : (trends.data?.length ?? 0) === 0 ? (
            <EmptyState title="No detections in this window" minHeight={300} />
          ) : (
            <TrendChart data={trends.data ?? []} height={320} />
          )}
        </CardBody>
      </Card>

      {/* --- Category + risk --------------------------------------------------- */}
      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Events by classification" description="Which thermal signatures dominate" />
          <CardBody>
            {categories.loading && !categories.data ? (
              <LoadingState minHeight={260} />
            ) : categories.error ? (
              <ErrorState message={categories.error} onRetry={categories.refetch} />
            ) : categories.data ? (
              <CategoryChart data={categories.data.byEventType} />
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Risk distribution" description="Share of events by assessed risk level" />
          <CardBody>
            {summary.loading && !summary.data ? (
              <LoadingState minHeight={260} />
            ) : summary.data ? (
              <RiskDistributionChart data={summary.data.riskDistribution} height={220} />
            ) : null}
          </CardBody>
        </Card>
      </div>

      {/* --- Region + facility type -------------------------------------------- */}
      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Regional distribution" description="Detections per region, high-risk share stacked" />
          <CardBody>
            {categories.loading && !categories.data ? (
              <LoadingState minHeight={280} />
            ) : (categories.data?.byRegion.length ?? 0) === 0 ? (
              <EmptyState title="No regional data" minHeight={280} />
            ) : categories.data ? (
              <RegionChart data={categories.data.byRegion} />
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Thermal load by facility class" description="Detections attributed to each plant type" />
          <CardBody>
            {categories.loading && !categories.data ? (
              <LoadingState minHeight={260} />
            ) : (categories.data?.byFacilityType.length ?? 0) === 0 ? (
              <EmptyState title="No facility data" minHeight={260} />
            ) : categories.data ? (
              <FacilityChart data={categories.data.byFacilityType} />
            ) : null}
          </CardBody>
        </Card>
      </div>

      {/* --- Detail table ------------------------------------------------------- */}
      <Card className="overflow-hidden">
        <CardHeader title="Classification detail" description="Count, share and average thermal signature per class" />
        {categories.data ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-line">
                  {['Event class', 'Detections', 'Share', 'Avg risk', 'Avg brightness'].map((header) => (
                    <th
                      key={header}
                      scope="col"
                      className="whitespace-nowrap px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-fg-subtle"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {categories.data.byEventType.map((row) => (
                  <tr key={row.eventType} className="border-b border-line/70 last:border-0">
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-2 text-xs text-fg">
                        <span
                          className="size-2.5 rounded-full"
                          style={{ backgroundColor: EVENT_TYPE_META[row.eventType].color }}
                          aria-hidden
                        />
                        {EVENT_TYPE_META[row.eventType].label}
                      </span>
                    </td>
                    <td className="tims-data px-4 py-2.5 text-xs text-fg-muted">{formatNumber(row.count)}</td>
                    <td className="tims-data px-4 py-2.5 text-xs text-fg-muted">{formatPercent(row.share)}</td>
                    <td className="tims-data px-4 py-2.5 text-xs text-fg-muted">{formatDecimal(row.avgRiskScore)}</td>
                    <td className="tims-data px-4 py-2.5 text-xs text-fg-muted">
                      {formatTemperature(row.avgBrightnessTemperature)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <LoadingState minHeight={220} />
        )}
      </Card>
    </div>
  );
}
