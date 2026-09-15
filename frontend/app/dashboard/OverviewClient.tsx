'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { BarList, StackedBar, TrendChart } from '@/components/charts';
import { Header } from '@/components/layout/Header';
import { MapLegendOverlay } from '@/components/map/MapLegend';
import { MapPanel } from '@/components/map/MapPanel';
import { ButtonLink } from '@/components/ui/Button';
import {
  Caveat,
  ClassBadge,
  ProvenanceBadge,
  RiskBadge,
  RiskMeter,
} from '@/components/ui/Indicators';
import { Panel, PanelBody, PanelHeader, Readout, ReadoutList } from '@/components/ui/Panel';
import { StatCard, StatRow } from '@/components/ui/StatCard';
import { EmptyState, ErrorState, LoadingState, NoticeBanner } from '@/components/ui/States';
import { useApi } from '@/hooks/useApi';
import { useTheme } from '@/hooks/useTheme';
import { useStaggerIn } from '@/hooks/useGsap';
import { useNavOpener } from './DashboardShell';
import { PILOT } from '@/lib/bhopal';
import {
  DISCLAIMERS,
  INDUSTRIAL_CLASSES,
  RISK_LEVELS,
  RISK_META,
  THERMAL_CLASS_META,
  THERMAL_CLASSES,
  classColor,
  riskColor,
} from '@/lib/constants';
import { formatDateTimeShort, formatDistance, formatPower } from '@/lib/format';
import {
  alertService,
  analyticsService,
  bhopalService,
  hotspotService,
  industryService,
} from '@/services';

/**
 * Operational overview.
 *
 * Four stat cards, the live map, the recent-detection register and the trend
 * chart — the four things an analyst looks at first. Everything is derived from
 * real API responses; nothing on this page is placeholder.
 */
export function OverviewClient() {
  const router = useRouter();
  const openNav = useNavOpener();
  const containerRef = useStaggerIn();
  const { theme } = useTheme();

  const summary = useApi(() => analyticsService.summary(30), []);
  const trends = useApi(() => analyticsService.trends(30), []);
  const categories = useApi(() => analyticsService.categories(30), []);
  const recent = useApi(() => hotspotService.list({ pageSize: 12, sortBy: 'detectedAt' }), []);
  const mapHotspots = useApi(() => hotspotService.list({ pageSize: 500, sortBy: 'riskScore' }), []);
  const facilities = useApi(() => industryService.list({ pageSize: 200 }), []);
  const boundary = useApi(() => bhopalService.boundary(), []);
  const alerts = useApi(() => alertService.recent(6), []);
  const health = useApi(() => bhopalService.health(), []);
  const weather = useApi(() => bhopalService.weather(), []);

  const stats = summary.data;

  /**
   * Industrial and vegetation counts are derived from the classification
   * breakdown rather than read from a dedicated field, so the numbers on this
   * page always agree with the class table in lib/constants.
   */
  const classCounts = useMemo(() => {
    const rows = mapHotspots.data?.items ?? [];
    const counts = new Map<string, number>();
    for (const hotspot of rows) {
      const key = hotspot.mlClass ?? 'UNKNOWN';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [mapHotspots.data]);

  const industrialCount = INDUSTRIAL_CLASSES.reduce(
    (total, key) => total + (classCounts.get(key) ?? 0),
    0,
  );
  const vegetationCount =
    (classCounts.get('POSSIBLE_VEGETATION_FIRE') ?? 0) +
    (classCounts.get('POSSIBLE_AGRICULTURAL_BURN') ?? 0);

  const mlDown = health.data?.dependencies.mlService.reachable === false;

  return (
    <>
      <Header
        title={`${PILOT.label} thermal monitoring`}
        subtitle={`${PILOT.id} · ${PILOT.state} · decision support only`}
        onOpenNav={openNav}
        actions={
          <ButtonLink href="/dashboard/map" size="sm">
            Full map →
          </ButtonLink>
        }
      />

      <div ref={containerRef} className="flex-1 space-y-px overflow-y-auto">
        {mlDown ? (
          <NoticeBanner label="Degraded" tone="warn" className="tims-enter m-3 mb-0">
            The classification service is unreachable
            {health.data?.dependencies.mlService.reason
              ? ` (${health.data.dependencies.mlService.reason})`
              : ''}
            . New detections are being classified by the transparent rule engine and are marked{' '}
            <span className="tims-data">RULE</span> rather than showing a model confidence.
          </NoticeBanner>
        ) : null}

        {/* --- Stat cards --------------------------------------------- */}
        {summary.loading ? (
          <LoadingState label="Loading summary" />
        ) : summary.error ? (
          <div className="p-3">
            <ErrorState message={summary.error} onRetry={summary.refetch} />
          </div>
        ) : stats ? (
          <StatRow className="border-y border-line">
            <StatCard
              label="Total detections"
              value={stats.totalThermalEvents.value}
              delta={stats.totalThermalEvents.changePercent}
              accent="neutral"
              footnote={`last ${stats.windowDays} days`}
            />
            <StatCard
              label="Industrial / persistent"
              value={industrialCount}
              accent="rust"
              footnote="possible industrial signature"
            />
            <StatCard
              label="Vegetation / agricultural"
              value={vegetationCount}
              accent="sage"
              footnote="non-industrial signature"
            />
            <StatCard
              label="High-priority alerts"
              value={stats.highRiskEvents.value}
              delta={stats.highRiskEvents.changePercent}
              accent="warn"
              footnote="HIGH or CRITICAL risk"
            />
          </StatRow>
        ) : null}

        {/* --- Map + side rail ---------------------------------------- */}
        <div className="grid gap-3 p-3 xl:grid-cols-[1fr_300px]">
          <Panel className="tims-enter relative min-h-[420px] overflow-hidden">
            <PanelHeader
              label="Live thermal map"
              meta={`${mapHotspots.data?.items.length ?? 0} plotted`}
              actions={
                <Link
                  href="/dashboard/map"
                  className="tims-nav-item tims-data border border-line px-1.5 py-0.5 text-[10px] text-fg-muted hover:text-fg"
                >
                  Expand
                </Link>
              }
            />
            <div className="relative h-[420px]">
              {mapHotspots.loading ? (
                <LoadingState label="Loading detections" className="h-full" />
              ) : (
                <>
                  <MapPanel
                    hotspots={mapHotspots.data?.items ?? []}
                    facilities={facilities.data?.items ?? []}
                    boundary={boundary.data}
                    selectedId={null}
                    onSelectHotspot={(hotspot) => router.push(`/dashboard/hotspots/${hotspot.id}`)}
                  />
                  <MapLegendOverlay />
                </>
              )}
            </div>
          </Panel>

          <div className="space-y-3">
            {/* Risk distribution — a stacked bar, not a donut. */}
            <Panel className="tims-enter">
              <PanelHeader label="Risk distribution" meta={`${stats?.windowDays ?? 30} d`} />
              <PanelBody>
                {stats ? (
                  <StackedBar
                    segments={RISK_LEVELS.map((level) => ({
                      label: RISK_META[level].label,
                      value:
                        stats.riskDistribution.find((row) => row.riskLevel === level)?.count ?? 0,
                      color: riskColor(level, theme),
                    }))}
                  />
                ) : (
                  <LoadingState />
                )}
                <Caveat className="mt-2">{DISCLAIMERS.risk}</Caveat>
              </PanelBody>
            </Panel>

            {/* Classification mix — horizontal bars, not a pie. */}
            <Panel className="tims-enter">
              <PanelHeader label="Classification mix" />
              <PanelBody>
                <BarList
                  items={THERMAL_CLASSES.filter((key) => (classCounts.get(key) ?? 0) > 0).map(
                    (key) => ({
                      label: THERMAL_CLASS_META[key].short,
                      value: classCounts.get(key) ?? 0,
                      color: classColor(key, theme),
                      title: THERMAL_CLASS_META[key].description,
                    }),
                  )}
                />
                <Caveat className="mt-2">{DISCLAIMERS.classification}</Caveat>
              </PanelBody>
            </Panel>

            {/* Station status — real capability reporting. */}
            <Panel className="tims-enter">
              <PanelHeader label="Station status" />
              <PanelBody className="py-1">
                <ReadoutList>
                  <Readout
                    label="PostGIS"
                    value={
                      health.data?.dependencies.postgis.available
                        ? (health.data.dependencies.postgis.version ?? 'available')
                        : 'unavailable'
                    }
                  />
                  <Readout
                    label="NASA FIRMS key"
                    value={health.data?.dependencies.firms.configured ? 'configured' : 'missing'}
                  />
                  <Readout
                    label="Classifier"
                    value={
                      health.data?.dependencies.mlService.reachable
                        ? (health.data.dependencies.mlService.modelVersion ?? 'reachable')
                        : 'rule fallback'
                    }
                  />
                  <Readout
                    label="Scheduled jobs"
                    value={health.data?.dependencies.cronJobs ? 'enabled' : 'disabled'}
                  />
                  <Readout
                    label="Weather"
                    value={
                      weather.data?.available
                        ? (weather.data.reading?.provider ?? 'available')
                        : 'unavailable'
                    }
                  />
                  {weather.data?.available && weather.data.reading ? (
                    <Readout
                      label="Conditions"
                      value={`${weather.data.reading.temperatureC ?? '—'}°C · ${
                        weather.data.reading.humidityPct ?? '—'
                      }% RH · ${weather.data.reading.windSpeedMs ?? '—'} m/s`}
                    />
                  ) : null}
                </ReadoutList>
                {weather.data && !weather.data.reading?.isOfficialSource && weather.data.available ? (
                  <Caveat className="mt-2">
                    Weather is from a non-official fallback provider, shown as context only.
                  </Caveat>
                ) : null}
              </PanelBody>
            </Panel>
          </div>
        </div>

        {/* --- Trend -------------------------------------------------- */}
        <div className="px-3 pb-3">
          <Panel className="tims-enter">
            <PanelHeader
              label="Detection trend"
              title="Detections per day"
              meta={`${trends.data?.length ?? 0} days`}
            />
            <PanelBody>
              {trends.loading ? (
                <LoadingState />
              ) : trends.error ? (
                <ErrorState message={trends.error} onRetry={trends.refetch} />
              ) : (
                <>
                  <TrendChart data={trends.data ?? []} height={190} />
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                    <LegendKey color="#7a8086" label="All detections" />
                    <LegendKey color="#c1502e" label="Industrial" />
                    <LegendKey color="#6b9e7a" label="High risk" dashed />
                  </div>
                </>
              )}
            </PanelBody>
          </Panel>
        </div>

        {/* --- Recent detections + alerts ----------------------------- */}
        <div className="grid gap-3 px-3 pb-3 xl:grid-cols-[1.4fr_1fr]">
          <Panel className="tims-enter">
            <PanelHeader
              label="Recent detections"
              meta={`${recent.data?.meta.total ?? 0} total`}
              actions={
                <Link
                  href="/dashboard/hotspots"
                  className="tims-nav-item tims-data border border-line px-1.5 py-0.5 text-[10px] text-fg-muted hover:text-fg"
                >
                  Register →
                </Link>
              }
            />
            {recent.loading ? (
              <LoadingState />
            ) : recent.error ? (
              <div className="p-3">
                <ErrorState message={recent.error} onRetry={recent.refetch} />
              </div>
            ) : (recent.data?.items.length ?? 0) === 0 ? (
              <EmptyState
                title="No detections ingested yet"
                detail="Run the FIRMS ingest to pull real NASA detections for the pilot area."
              />
            ) : (
              <ul className="divide-y divide-line">
                {recent.data?.items.slice(0, 9).map((hotspot) => (
                  <li key={hotspot.id}>
                    <Link
                      href={`/dashboard/hotspots/${hotspot.id}`}
                      prefetch={false}
                      className="tims-row flex items-center gap-3 px-3 py-2"
                    >
                      <span className="w-[86px] flex-none">
                        <RiskMeter
                          score={hotspot.riskScore}
                          level={hotspot.riskLevel}
                          showValue={false}
                        />
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <ClassBadge thermalClass={hotspot.mlClass} compact />
                          <ProvenanceBadge
                            path={hotspot.classificationPath}
                            confidence={hotspot.mlConfidence}
                            modelVersion={hotspot.modelVersion}
                          />
                        </span>
                        <span className="tims-data mt-1 block truncate text-[10px] text-fg-subtle">
                          {formatDateTimeShort(hotspot.detectedAt)} · {formatPower(hotspot.frp)} ·{' '}
                          {hotspot.distanceToFacilityM != null
                            ? `${formatDistance(hotspot.distanceToFacilityM)} to industry`
                            : 'no facility nearby'}
                        </span>
                      </span>

                      <span className="flex-none">
                        <RiskBadge level={hotspot.riskLevel} score={hotspot.riskScore} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel className="tims-enter">
            <PanelHeader
              label="Alert feed"
              meta={`${stats?.unreadAlerts ?? 0} unread`}
              actions={
                <Link
                  href="/dashboard/alerts"
                  className="tims-nav-item tims-data border border-line px-1.5 py-0.5 text-[10px] text-fg-muted hover:text-fg"
                >
                  All →
                </Link>
              }
            />
            {alerts.loading ? (
              <LoadingState />
            ) : (alerts.data?.length ?? 0) === 0 ? (
              <EmptyState
                title="No alerts"
                detail="Alerts are raised automatically when a detection scores HIGH or above, or when the model reports a high-confidence industrial signature."
              />
            ) : (
              <ul className="divide-y divide-line">
                {alerts.data?.map((alert) => (
                  <li key={alert.id} className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <RiskBadge level={alert.severity} />
                      <span className="tims-data ml-auto text-[10px] text-fg-subtle">
                        {formatDateTimeShort(alert.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-fg">
                      {alert.title}
                    </p>
                    {alert.reasons.length > 0 ? (
                      <p className="mt-1 truncate text-[10px] text-fg-subtle">
                        {alert.reasons[0]}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        {/* --- Key insights ------------------------------------------- */}
        {categories.data ? (
          <div className="px-3 pb-4">
            <Panel className="tims-enter">
              <PanelHeader label="Key insights" title="What the current window shows" />
              <PanelBody>
                <ul className="space-y-1.5 text-[11px] leading-relaxed text-fg-muted">
                  <li>
                    <span className="tims-data text-fg">{industrialCount}</span> of{' '}
                    <span className="tims-data text-fg">
                      {mapHotspots.data?.items.length ?? 0}
                    </span>{' '}
                    plotted detections carry a possible industrial signature — co-location with a
                    mapped site is suggestive, not proof.
                  </li>
                  <li>
                    Mean risk score is{' '}
                    <span className="tims-data text-fg">
                      {stats?.averageRiskScore.toFixed(1) ?? '—'}
                    </span>{' '}
                    across the window, with{' '}
                    <span className="tims-data text-fg">
                      {stats?.persistentThermalSources.value ?? 0}
                    </span>{' '}
                    sources recurring on three or more days.
                  </li>
                  <li>
                    <span className="tims-data text-fg">{stats?.monitoredFacilities ?? 0}</span>{' '}
                    industrial sites are on record inside the pilot area, all from OpenStreetMap
                    rather than an official register.
                  </li>
                </ul>
                <Caveat className="mt-3">{DISCLAIMERS.decisionSupport}</Caveat>
              </PanelBody>
            </Panel>
          </div>
        ) : null}
      </div>
    </>
  );
}

function LegendKey({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="block h-0 w-4 border-t"
        style={{ borderColor: color, borderTopStyle: dashed ? 'dashed' : 'solid', borderTopWidth: 1.5 }}
        aria-hidden
      />
      <span className="text-[10px] text-fg-subtle">{label}</span>
    </span>
  );
}
