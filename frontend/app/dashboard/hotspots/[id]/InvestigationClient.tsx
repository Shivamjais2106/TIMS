'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { BarList } from '@/components/charts';
import { Header } from '@/components/layout/Header';
import { MapPanel } from '@/components/map/MapPanel';
import { Button } from '@/components/ui/Button';
import {
  Caveat,
  ClassBadge,
  PersistenceBadge,
  ProvenanceBadge,
  RiskBadge,
  RiskMeter,
  Status,
} from '@/components/ui/Indicators';
import { Panel, PanelBody, PanelHeader, Readout, ReadoutList } from '@/components/ui/Panel';
import { ErrorState, LoadingState, NoticeBanner } from '@/components/ui/States';
import { useApi } from '@/hooks/useApi';
import { useStaggerIn } from '@/hooks/useGsap';
import { usePalette } from '@/hooks/useTheme';
import { useNavOpener } from '../../DashboardShell';
import { THRESHOLDS } from '@/lib/bhopal';
import { describeFirmsProduct, DISCLAIMERS, EMERGENCY_TYPE_META, THERMAL_CLASS_META } from '@/lib/constants';
import { describeError } from '@/lib/api';
import {
  formatCoordinatePair,
  formatDateTime,
  formatDistance,
  formatPower,
  formatTemperature,
  shortId,
} from '@/lib/format';
import { bhopalService, emergencyService, hotspotService, reportService } from '@/services';
import type { EmergencyFacility } from '@/types';

/**
 * Hotspot investigation.
 *
 * This is the page the whole pipeline exists to produce: what was detected,
 * what the classifier thinks and why, what the risk score is composed of, what
 * is exposed within 1/3/5 km, and which response resources are nearest.
 */
export function InvestigationClient({ hotspotId }: { hotspotId: string }) {
  const openNav = useNavOpener();
  const containerRef = useStaggerIn();
  const palette = usePalette();

  const hotspot = useApi(() => hotspotService.getById(hotspotId), [hotspotId]);
  const impact = useApi(() => bhopalService.impact(hotspotId), [hotspotId]);
  const plan = useApi(() => emergencyService.responsePlan(hotspotId), [hotspotId]);
  const boundary = useApi(() => bhopalService.boundary(), []);
  const nearby = useApi(() => hotspotService.nearbyFacilities(hotspotId, 5), [hotspotId]);

  const [reportState, setReportState] = useState<{ busy: boolean; message: string | null }>({
    busy: false,
    message: null,
  });

  async function generateReport() {
    setReportState({ busy: true, message: null });
    try {
      const report = await reportService.generate({ kind: 'incident', hotspotId });
      setReportState({ busy: false, message: `Report ${shortId(report.id)} generated.` });
    } catch (error) {
      setReportState({ busy: false, message: describeError(error) });
    }
  }

  // Receptors to plot: the named nearest of each type, plus everything inside
  // the first impact zone. Built here so the map's props stay stable between
  // renders instead of receiving a freshly-allocated array every time.
  const mapReceptors = useMemo(
    () =>
      [
        plan.data?.nearestHospital,
        plan.data?.nearestFireStation,
        plan.data?.nearestSchool,
        ...(plan.data?.receptorsWithinFirstZone ?? []),
      ].filter((facility): facility is EmergencyFacility => Boolean(facility)),
    [plan.data],
  );

  if (hotspot.loading) {
    return (
      <>
        <Header title="Hotspot investigation" onOpenNav={openNav} />
        <LoadingState label="Loading detection" />
      </>
    );
  }

  if (hotspot.error || !hotspot.data) {
    return (
      <>
        <Header title="Hotspot investigation" onOpenNav={openNav} />
        <div className="p-3">
          <ErrorState
            message={hotspot.error ?? `Hotspot ${hotspotId} not found`}
            onRetry={hotspot.refetch}
          />
        </div>
      </>
    );
  }

  const detection = hotspot.data;
  const assessment = plan.data?.riskAssessment ?? null;
  const product = describeFirmsProduct(detection.firmsProduct);
  const classMeta = detection.mlClass ? THERMAL_CLASS_META[detection.mlClass] : null;

  return (
    <>
      <Header
        title={classMeta?.label ?? 'Unclassified thermal anomaly'}
        subtitle={`${formatCoordinatePair(detection.latitude, detection.longitude)} · ${formatDateTime(
          detection.detectedAt,
        )}`}
        onOpenNav={openNav}
        actions={
          <Link
            href="/dashboard/hotspots"
            className="tims-nav-item tims-data border border-line px-2 py-1 text-[11px] text-fg-muted hover:text-fg"
          >
            ← Register
          </Link>
        }
      />

      <div ref={containerRef} className="flex-1 overflow-y-auto">
        {/* --- Incident banner ---------------------------------------- */}
        <div className="tims-enter flex flex-wrap items-center gap-2 border-b border-line bg-surface-2 px-3 py-2">
          <RiskBadge level={detection.riskLevel} score={detection.riskScore} />
          <ClassBadge thermalClass={detection.mlClass} />
          <ProvenanceBadge
            path={detection.classificationPath}
            confidence={detection.mlConfidence}
            modelVersion={detection.modelVersion}
          />
          <PersistenceBadge days={detection.persistenceDays} />
          <Status
            color={detection.inBhopalBoundary ? palette.sage : palette.riskHigh}
            title={
              detection.inBhopalBoundary
                ? 'PostGIS ST_Within confirmed this point is inside the Bhopal district polygon.'
                : 'This point is inside the fetch bounding box but outside the district polygon.'
            }
          >
            {detection.inBhopalBoundary ? 'In Bhopal' : 'Outside district'}
          </Status>
          <span className="tims-data ml-auto text-[10px] text-fg-subtle">
            {shortId(detection.id, 8, 4)}
          </span>
        </div>

        {(detection.riskLevel === 'HIGH' || detection.riskLevel === 'CRITICAL') ? (
          <NoticeBanner label="Decision support" tone="danger" className="tims-enter m-3 mb-0">
            {DISCLAIMERS.decisionSupport}. This incident meets the alerting threshold; verify against
            ground reports before escalation.
          </NoticeBanner>
        ) : null}

        <div className="grid gap-3 p-3 xl:grid-cols-[1fr_340px]">
          <div className="space-y-3">
            {/* --- Map ---------------------------------------------- */}
            <Panel className="tims-enter overflow-hidden">
              <PanelHeader
                label="Position and impact zones"
                meta={`${THRESHOLDS.impactZonesKm.join(' / ')} km`}
              />
              <div className="h-[320px]">
                <MapPanel
                  hotspots={[detection]}
                  // Nearest-of-each-type first, then everything in the inner
                  // impact zone. These overlap; ThermalMap de-duplicates by id.
                  emergencyFacilities={mapReceptors}
                  facilities={
                    plan.data?.nearestIndustrialFacility ? [plan.data.nearestIndustrialFacility] : []
                  }
                  boundary={boundary.data}
                  layers={{
                    hotspots: true,
                    industry: true,
                    hospitals: true,
                    fireStations: true,
                    schools: true,
                    boundary: true,
                    fetchBbox: false,
                    impactZones: true,
                  }}
                  selectedId={detection.id}
                  focus={[detection.latitude, detection.longitude]}
                  impactCenter={[detection.latitude, detection.longitude]}
                  impactRadiiKm={[...THRESHOLDS.impactZonesKm]}
                />
              </div>
            </Panel>

            {/* --- Risk breakdown ---------------------------------- */}
            <Panel className="tims-enter">
              <PanelHeader
                label="Risk assessment"
                title={`Score ${detection.riskScore.toFixed(1)} / 100`}
                meta={assessment ? `weights sum 100` : undefined}
              />
              <PanelBody className="space-y-3">
                <RiskMeter score={detection.riskScore} level={detection.riskLevel} />

                {assessment ? (
                  <>
                    <div>
                      <p className="tims-label mb-1.5">Component contributions</p>
                      <BarList
                        total={30}
                        items={[
                          {
                            label: `Fire radiative power (weight ${assessment.weights['frp'] ?? 30})`,
                            value: assessment.components.frp,
                            color: palette.rust,
                          },
                          {
                            label: `Detection confidence (weight ${assessment.weights['confidence'] ?? 20})`,
                            value: assessment.components.confidence,
                            color: palette.riskHigh,
                          },
                          {
                            label: `Persistence (weight ${assessment.weights['persistence'] ?? 20})`,
                            value: assessment.components.persistence,
                            color: palette.riskMedium,
                          },
                          {
                            label: `Industrial proximity (weight ${assessment.weights['industrialProximity'] ?? 20})`,
                            value: assessment.components.industrialProximity,
                            color: palette.rustDim,
                          },
                          {
                            label: `Populated proximity (weight ${assessment.weights['populatedProximity'] ?? 10})`,
                            value: assessment.components.populatedProximity,
                            color: palette.sage,
                          },
                        ]}
                      />
                    </div>

                    <div>
                      <p className="tims-label mb-1.5">Why this score</p>
                      <ul className="space-y-1">
                        {assessment.reasons.map((reason, index) => (
                          <li
                            key={`${index}-${reason}`}
                            className="flex gap-2 border-l-2 border-l-line-strong pl-2 text-[11px] leading-snug text-fg-muted"
                          >
                            <span className="tims-data flex-none text-fg-subtle">
                              {String(index + 1).padStart(2, '0')}
                            </span>
                            <span>{reason}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </>
                ) : plan.loading ? (
                  <LoadingState label="Loading assessment" />
                ) : (
                  <p className="text-[11px] text-fg-subtle">
                    No stored risk assessment for this detection.
                  </p>
                )}

                <Caveat>{DISCLAIMERS.risk}</Caveat>
              </PanelBody>
            </Panel>

            {/* --- Impact zones ------------------------------------ */}
            <Panel className="tims-enter">
              <PanelHeader label="Impact analysis" title="Exposure by radius" />
              <PanelBody>
                {impact.loading ? (
                  <LoadingState />
                ) : impact.error ? (
                  <ErrorState message={impact.error} onRetry={impact.refetch} />
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse text-left">
                        <thead>
                          <tr className="border-b border-line">
                            {['Radius', 'Hospitals', 'Fire stns', 'Schools', 'Police', 'Industry', 'Other detections', 'Population'].map(
                              (header) => (
                                <th key={header} className="px-2 py-1.5">
                                  <span className="tims-label">{header}</span>
                                </th>
                              ),
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {impact.data?.zones.map((zone) => (
                            <tr key={zone.radiusKm} className="tims-row border-b border-line/70">
                              <td className="tims-data px-2 py-1.5 text-[12px] text-fg">
                                {zone.radiusKm} km
                              </td>
                              <td className="tims-data px-2 py-1.5 text-[12px] text-fg">
                                {zone.counts.hospitals}
                              </td>
                              <td className="tims-data px-2 py-1.5 text-[12px] text-fg">
                                {zone.counts.fireStations}
                              </td>
                              <td className="tims-data px-2 py-1.5 text-[12px] text-fg">
                                {zone.counts.schools}
                              </td>
                              <td className="tims-data px-2 py-1.5 text-[12px] text-fg">
                                {zone.counts.police}
                              </td>
                              <td className="tims-data px-2 py-1.5 text-[12px] text-fg">
                                {zone.counts.industrialFacilities}
                              </td>
                              <td className="tims-data px-2 py-1.5 text-[12px] text-fg">
                                {zone.counts.otherHotspots}
                              </td>
                              <td className="px-2 py-1.5 text-[11px] text-fg-subtle">
                                unavailable
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <Caveat className="mt-2">{DISCLAIMERS.population}</Caveat>
                    <Caveat className="mt-1">{DISCLAIMERS.distances}</Caveat>
                  </>
                )}
              </PanelBody>
            </Panel>
          </div>

          {/* --- Right rail ---------------------------------------- */}
          <div className="space-y-3">
            <Panel className="tims-enter">
              <PanelHeader label="Detection record" />
              <PanelBody className="py-1">
                <ReadoutList>
                  <Readout label="Detected (IST)" value={formatDateTime(detection.detectedAt)} mono={false} />
                  <Readout
                    label="Position"
                    value={formatCoordinatePair(detection.latitude, detection.longitude)}
                  />
                  <Readout label="Brightness" value={formatTemperature(detection.brightnessTemperature)} />
                  <Readout label="FRP" value={formatPower(detection.frp)} />
                  <Readout label="Confidence" value={`${detection.confidence}%`} />
                  <Readout label="Day / night" value={detection.dayNight === 'N' ? 'Night' : 'Day'} />
                  <Readout label="Satellite" value={detection.satellite ?? '—'} />
                  <Readout label="Instrument" value={detection.instrument ?? '—'} />
                  <Readout
                    label="FIRMS product"
                    value={product.label}
                    title={
                      product.latency === 'archive'
                        ? 'Read from the FIRMS archive. This is a historical detection, not near-real-time.'
                        : 'Near-real-time product.'
                    }
                  />
                  <Readout label="Persistence" value={`${detection.persistenceDays} day(s)`} />
                </ReadoutList>
              </PanelBody>
            </Panel>

            {/* --- Classification ---------------------------------- */}
            <Panel className="tims-enter">
              <PanelHeader label="Classification" />
              <PanelBody className="space-y-2">
                <ClassBadge thermalClass={detection.mlClass} />
                {classMeta ? (
                  <p className="text-[11px] leading-relaxed text-fg-muted">{classMeta.description}</p>
                ) : null}
                <ReadoutList>
                  <Readout
                    label="Path"
                    value={detection.classificationPath === 'ML_SERVICE' ? 'Model' : 'Rule fallback'}
                  />
                  <Readout
                    label="Confidence"
                    value={
                      detection.mlConfidence != null
                        ? `${(detection.mlConfidence * 100).toFixed(1)}%`
                        : 'n/a (rule)'
                    }
                  />
                  <Readout label="Model" value={detection.modelVersion ?? '—'} />
                </ReadoutList>
                <Caveat>{DISCLAIMERS.classification}</Caveat>
              </PanelBody>
            </Panel>

            {/* --- Emergency response ----------------------------- */}
            <Panel className="tims-enter">
              <PanelHeader label="Emergency response" title="Nearest resources" />
              <PanelBody className="space-y-2">
                {plan.loading ? (
                  <LoadingState />
                ) : plan.error ? (
                  <ErrorState message={plan.error} onRetry={plan.refetch} />
                ) : (
                  <>
                    <ResourceRow
                      label={EMERGENCY_TYPE_META.FIRE_STATION.label}
                      name={plan.data?.nearestFireStation?.name ?? null}
                      distance={plan.data?.nearestFireStation?.distanceMeters ?? null}
                      color={EMERGENCY_TYPE_META.FIRE_STATION.color}
                    />
                    <ResourceRow
                      label={EMERGENCY_TYPE_META.HOSPITAL.label}
                      name={plan.data?.nearestHospital?.name ?? null}
                      distance={plan.data?.nearestHospital?.distanceMeters ?? null}
                      color={EMERGENCY_TYPE_META.HOSPITAL.color}
                    />
                    <ResourceRow
                      label={EMERGENCY_TYPE_META.SCHOOL.label}
                      name={plan.data?.nearestSchool?.name ?? null}
                      distance={plan.data?.nearestSchool?.distanceMeters ?? null}
                      color={EMERGENCY_TYPE_META.SCHOOL.color}
                    />
                    <ResourceRow
                      label="Industrial site"
                      name={plan.data?.nearestIndustrialFacility?.name ?? null}
                      distance={plan.data?.nearestIndustrialFacility?.distanceMeters ?? null}
                      color="#b57340"
                    />

                    <Caveat>{plan.data?.routingNote}</Caveat>
                  </>
                )}
              </PanelBody>
            </Panel>

            {/* --- Nearby industry -------------------------------- */}
            <Panel className="tims-enter">
              <PanelHeader
                label="Industry within 5 km"
                meta={`${nearby.data?.length ?? 0} sites`}
              />
              <PanelBody>
                {nearby.loading ? (
                  <LoadingState />
                ) : (nearby.data?.length ?? 0) === 0 ? (
                  <p className="py-3 text-center text-[11px] text-fg-subtle">
                    No mapped industrial site within 5 km.
                  </p>
                ) : (
                  <ul className="divide-y divide-line">
                    {nearby.data?.slice(0, 8).map((facility) => (
                      <li key={facility.id} className="flex items-baseline gap-2 py-1.5">
                        <span className="min-w-0 flex-1 truncate text-[11px] text-fg">
                          {facility.name}
                        </span>
                        <span className="tims-data flex-none text-[11px] text-fg-muted">
                          {formatDistance(facility.distanceMeters)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <Caveat className="mt-2">
                  Facility geometry is from OpenStreetMap, not an official register. Unnamed
                  industrial zones are retained because they still carry real geometry.
                </Caveat>
              </PanelBody>
            </Panel>

            {/* --- Report ----------------------------------------- */}
            <Panel className="tims-enter">
              <PanelHeader label="Actions" />
              <PanelBody className="space-y-2">
                <Button
                  onClick={generateReport}
                  disabled={reportState.busy}
                  variant="primary"
                  className="w-full"
                >
                  {reportState.busy ? 'Generating…' : 'Generate incident report'}
                </Button>
                {reportState.message ? (
                  <p className="text-[11px] text-fg-muted">{reportState.message}</p>
                ) : null}
                <Link
                  href="/dashboard/reports"
                  className="tims-nav-item block border border-line px-2 py-1.5 text-center text-[11px] text-fg-muted hover:text-fg"
                >
                  Report history →
                </Link>
              </PanelBody>
            </Panel>
          </div>
        </div>
      </div>
    </>
  );
}

function ResourceRow({
  label,
  name,
  distance,
  color,
}: {
  label: string;
  name: string | null;
  distance: number | null;
  color: string;
}) {
  return (
    <div className="border border-line bg-surface-2 px-2 py-1.5" style={{ borderLeftWidth: 2, borderLeftColor: color }}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="tims-label">{label}</span>
        <span className="tims-data flex-none text-[11px] text-fg">
          {distance != null ? formatDistance(distance) : '—'}
        </span>
      </div>
      <p className="mt-0.5 truncate text-[11px] text-fg-muted">{name ?? 'None on record'}</p>
    </div>
  );
}
