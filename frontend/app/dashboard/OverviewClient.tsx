'use client';

import { Flame, Gauge, Radar, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { AlertCard } from '@/components/alerts/AlertCard';
import { RiskDistributionChart, TrendChart } from '@/components/charts';
import { FacilitySummaryPanel } from '@/components/dashboard/FacilitySummaryPanel';
import { RecentEvents } from '@/components/dashboard/RecentEvents';
import { MapView } from '@/components/map/MapView';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import { LoadingState, StatSkeleton } from '@/components/ui/LoadingState';
import { StatCard } from '@/components/ui/StatCard';
import { useApi } from '@/hooks/useApi';
import { EVENT_TYPE_META, RISK_META } from '@/lib/constants';
import { alertService } from '@/services/alert.service';
import { analyticsService } from '@/services/analytics.service';
import { hotspotService } from '@/services/hotspot.service';
import { industryService } from '@/services/industry.service';

const WINDOW_OPTIONS = [7, 30, 90] as const;

export function OverviewClient() {
  const [windowDays, setWindowDays] = useState<number>(30);

  const summary = useApi(() => analyticsService.summary(windowDays), [windowDays]);
  const trends = useApi(() => analyticsService.trends(windowDays, 'day'), [windowDays]);
  const recent = useApi(() => hotspotService.recent(8), []);
  const alerts = useApi(() => alertService.recent(4), []);
  const facilities = useApi(() => industryService.summary(), []);
  // Most recent rather than highest risk: sorting by risk returns only the
  // industrial clusters, which all sit under the facility badges and make the
  // overview map look empty. Recency gives a representative national picture.
  const mapHotspots = useApi(
    () => hotspotService.list({ pageSize: 600, sortBy: 'detectedAt', sortOrder: 'desc' }),
    [],
  );
  const mapFacilities = useApi(() => industryService.list({ pageSize: 200 }), []);

  return (
    <div className="space-y-5">
      {/* --- Window selector ---------------------------------------------- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-fg-muted">
          Showing thermal activity for the last <span className="font-medium text-fg">{windowDays} days</span>
        </p>
        <div className="inline-flex rounded-lg border border-line bg-surface p-0.5">
          {WINDOW_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setWindowDays(option)}
              aria-pressed={windowDays === option}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                windowDays === option ? 'bg-primary/12 text-primary' : 'text-fg-muted hover:text-fg'
              }`}
            >
              {option}d
            </button>
          ))}
        </div>
      </div>

      {/* --- Stat tiles ----------------------------------------------------- */}
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
            label="Total thermal events"
            value={summary.data.totalThermalEvents.value}
            delta={summary.data.totalThermalEvents}
            icon={Radar}
            accent="#22d3ee"
            caption="vs previous period"
          />
          <StatCard
            label="Industrial fire events"
            value={summary.data.industrialFireEvents.value}
            delta={summary.data.industrialFireEvents}
            icon={Flame}
            accent={EVENT_TYPE_META.INDUSTRIAL_FIRE.color}
            caption="fires and flares"
          />
          <StatCard
            label="Persistent sources"
            value={summary.data.persistentThermalSources.value}
            delta={summary.data.persistentThermalSources}
            icon={Gauge}
            accent={EVENT_TYPE_META.GAS_FLARE.color}
            caption="active 3+ days"
          />
          <StatCard
            label="High risk events"
            value={summary.data.highRiskEvents.value}
            delta={summary.data.highRiskEvents}
            icon={TriangleAlert}
            accent={RISK_META.CRITICAL.color}
            caption="high or critical"
          />
        </div>
      ) : null}

      {/* --- Map + recent events -------------------------------------------- */}
      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="overflow-hidden xl:col-span-2">
          <CardHeader
            title="Live thermal map"
            description="Latest detections and monitored industrial facilities"
            action={
              <Link href="/dashboard/map" className="text-xs font-medium text-primary hover:underline">
                Open full map
              </Link>
            }
          />
          <div className="h-[420px]">
            {mapHotspots.loading && !mapHotspots.data ? (
              <LoadingState label="Loading detections" minHeight={420} />
            ) : (
              <MapView
                hotspots={mapHotspots.data?.items ?? []}
                facilities={mapFacilities.data?.items ?? []}
                radiusKm={10}
                fitToData={false}
              />
            )}
          </div>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader
            title="Recent thermal events"
            description="Newest detections across all sources"
            action={
              <Link href="/dashboard/hotspots" className="text-xs font-medium text-primary hover:underline">
                View all
              </Link>
            }
          />
          {recent.loading && !recent.data ? (
            <LoadingState minHeight={360} />
          ) : recent.error ? (
            <ErrorState message={recent.error} onRetry={recent.refetch} />
          ) : (
            <div className="max-h-[420px] overflow-y-auto">
              <RecentEvents hotspots={recent.data ?? []} />
            </div>
          )}
        </Card>
      </div>

      {/* --- Charts ---------------------------------------------------------- */}
      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Thermal events trend"
            description={`Daily detections over the last ${windowDays} days`}
          />
          <CardBody>
            {trends.loading && !trends.data ? (
              <LoadingState minHeight={280} />
            ) : trends.error ? (
              <ErrorState message={trends.error} onRetry={trends.refetch} />
            ) : (trends.data?.length ?? 0) === 0 ? (
              <EmptyState title="No detections in this window" minHeight={280} />
            ) : (
              <TrendChart data={trends.data ?? []} />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Risk distribution" description="Share of events by assessed risk level" />
          <CardBody>
            {summary.loading && !summary.data ? (
              <LoadingState minHeight={240} />
            ) : summary.data ? (
              <RiskDistributionChart data={summary.data.riskDistribution} />
            ) : null}
          </CardBody>
        </Card>
      </div>

      {/* --- Alerts + facility summary --------------------------------------- */}
      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="overflow-hidden">
          <CardHeader
            title="Recent alerts"
            description="Automatically raised, newest first"
            action={
              <Link href="/dashboard/alerts" className="text-xs font-medium text-primary hover:underline">
                View all
              </Link>
            }
          />
          <CardBody className="space-y-2.5">
            {alerts.loading && !alerts.data ? (
              <LoadingState minHeight={220} />
            ) : alerts.error ? (
              <ErrorState message={alerts.error} onRetry={alerts.refetch} />
            ) : (alerts.data?.length ?? 0) === 0 ? (
              <EmptyState title="No alerts raised" description="Nothing has crossed the alert threshold." minHeight={220} />
            ) : (
              (alerts.data ?? []).map((alert) => <AlertCard key={alert.id} alert={alert} compact />)
            )}
          </CardBody>
        </Card>

        <Card className="overflow-hidden xl:col-span-2">
          <CardHeader
            title="Industrial facility summary"
            description="Sites ranked by observed thermal activity"
            action={
              <Link href="/dashboard/industries" className="text-xs font-medium text-primary hover:underline">
                View all
              </Link>
            }
          />
          {facilities.loading && !facilities.data ? (
            <LoadingState minHeight={280} />
          ) : facilities.error ? (
            <ErrorState message={facilities.error} onRetry={facilities.refetch} />
          ) : facilities.data ? (
            <FacilitySummaryPanel summary={facilities.data} />
          ) : null}
        </Card>
      </div>
    </div>
  );
}
