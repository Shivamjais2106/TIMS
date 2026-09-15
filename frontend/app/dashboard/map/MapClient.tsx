'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Header } from '@/components/layout/Header';
import { MapControls } from '@/components/map/MapLegend';
import { DEFAULT_LAYERS, MapPanel, type MapLayers } from '@/components/map/MapPanel';
import { SegmentedControl } from '@/components/ui/Button';
import { Caveat, ClassBadge, ProvenanceBadge, RiskBadge } from '@/components/ui/Indicators';
import { Panel, PanelBody, PanelHeader, Readout, ReadoutList } from '@/components/ui/Panel';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { useApi } from '@/hooks/useApi';
import { useTheme } from '@/hooks/useTheme';
import { useNavOpener } from '../DashboardShell';
import { BHOPAL_BBOX, THRESHOLDS } from '@/lib/bhopal';
import { DISCLAIMERS, riskColor } from '@/lib/constants';
import {
  formatCoordinatePair,
  formatDateTime,
  formatDistance,
  formatPower,
  formatTemperature,
} from '@/lib/format';
import { bhopalService, emergencyService, hotspotService, industryService } from '@/services';
import type { Hotspot, RiskLevel } from '@/types';

/** Time windows offered by the historical selector (brief section 16). */
const WINDOWS = [
  { value: '1', label: '24 h' },
  { value: '7', label: '7 d' },
  { value: '30', label: '30 d' },
  { value: 'all', label: 'All' },
] as const;

type WindowValue = (typeof WINDOWS)[number]['value'];

const RISK_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'CRITICAL', label: 'Crit' },
  { value: 'HIGH', label: 'High' },
  { value: 'MEDIUM', label: 'Med' },
  { value: 'LOW', label: 'Low' },
] as const;

/**
 * Full-screen thermal map with layer filters and a historical time selector.
 *
 * The selected detection opens an inspector rail rather than a modal, so the
 * map stays visible while an analyst reads the readout — the usual pattern for
 * a geospatial console.
 */
export function MapClient() {
  const router = useRouter();
  const openNav = useNavOpener();
  const { theme } = useTheme();

  const [layers, setLayers] = useState<MapLayers>(DEFAULT_LAYERS);
  const [windowDays, setWindowDays] = useState<WindowValue>('all');
  const [riskFilter, setRiskFilter] = useState<string>('all');
  const [selected, setSelected] = useState<Hotspot | null>(null);

  const query = useMemo(() => {
    const filters: Record<string, unknown> = { pageSize: 500, sortBy: 'riskScore', sortOrder: 'desc' };
    if (windowDays !== 'all') {
      filters['from'] = new Date(Date.now() - Number(windowDays) * 86_400_000).toISOString();
    }
    if (riskFilter !== 'all') filters['riskLevel'] = [riskFilter as RiskLevel];
    return filters;
  }, [windowDays, riskFilter]);

  const hotspots = useApi(() => hotspotService.list(query), [JSON.stringify(query)]);
  const facilities = useApi(() => industryService.list({ pageSize: 300 }), []);
  const emergency = useApi(() => emergencyService.list({ pageSize: 500 }), []);
  const boundary = useApi(() => bhopalService.boundary(), []);

  // Array.isArray rather than `?? []`: a non-array here is what produced the
  // "emergencyItems.filter is not a function" crash, and a map page that
  // silently shows zero receptors is far better than one that will not render.
  const emergencyItems = Array.isArray(emergency.data?.items) ? emergency.data.items : [];

  const counts = useMemo(
    () => ({
      hotspots: hotspots.data?.items.length ?? 0,
      industry: facilities.data?.items.length ?? 0,
      hospitals: emergencyItems.filter((facility) => facility.type === 'HOSPITAL').length,
      fireStations: emergencyItems.filter((facility) => facility.type === 'FIRE_STATION').length,
      schools: emergencyItems.filter((facility) => facility.type === 'SCHOOL').length,
    }),
    [hotspots.data, facilities.data, emergencyItems],
  );

  return (
    <>
      <Header
        title="Live thermal map"
        subtitle={`${counts.hotspots} detections plotted · Bhopal district geofence`}
        onOpenNav={openNav}
        actions={
          <SegmentedControl
            options={WINDOWS.map((option) => ({ value: option.value, label: option.label }))}
            value={windowDays}
            onChange={setWindowDays}
          />
        }
      />

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* --- Map ----------------------------------------------------- */}
        <div className="relative min-h-[380px] flex-1 border-b border-line lg:border-b-0 lg:border-r">
          {hotspots.loading && !hotspots.data ? (
            <LoadingState label="Loading detections" className="h-full" />
          ) : hotspots.error ? (
            <div className="p-3">
              <ErrorState message={hotspots.error} onRetry={hotspots.refetch} />
            </div>
          ) : (
            <MapPanel
              hotspots={hotspots.data?.items ?? []}
              facilities={facilities.data?.items ?? []}
              emergencyFacilities={emergencyItems}
              boundary={boundary.data}
              layers={layers}
              selectedId={selected?.id ?? null}
              onSelectHotspot={setSelected}
              focus={selected ? [selected.latitude, selected.longitude] : null}
              impactCenter={selected ? [selected.latitude, selected.longitude] : null}
              impactRadiiKm={[...THRESHOLDS.impactZonesKm]}
            />
          )}

          {/* Risk filter, floated over the map so it is reachable without
              leaving the canvas. */}
          <div className="absolute right-2 top-2 z-[400]">
            <SegmentedControl
              options={RISK_FILTERS.map((option) => ({
                value: option.value,
                label: option.label,
                color: option.value === 'all' ? undefined : riskColor(option.value as RiskLevel, theme),
              }))}
              value={riskFilter}
              onChange={setRiskFilter}
              className="bg-bg/92 backdrop-blur"
            />
          </div>
        </div>

        {/* --- Right rail --------------------------------------------- */}
        <aside className="flex w-full flex-none flex-col overflow-y-auto lg:w-[288px]">
          {selected ? (
            <Panel className="border-0 border-b">
              <PanelHeader
                label="Selected detection"
                actions={
                  <button
                    type="button"
                    onClick={() => setSelected(null)}
                    className="tims-nav-item tims-data border border-line px-1.5 py-0.5 text-[10px] text-fg-muted hover:text-fg"
                  >
                    Clear
                  </button>
                }
              />
              <PanelBody className="space-y-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <RiskBadge level={selected.riskLevel} score={selected.riskScore} />
                  <ClassBadge thermalClass={selected.mlClass} compact />
                  <ProvenanceBadge
                    path={selected.classificationPath}
                    confidence={selected.mlConfidence}
                    modelVersion={selected.modelVersion}
                  />
                </div>

                <ReadoutList>
                  <Readout label="Detected" value={formatDateTime(selected.detectedAt)} mono={false} />
                  <Readout
                    label="Position"
                    value={formatCoordinatePair(selected.latitude, selected.longitude)}
                  />
                  <Readout label="Brightness" value={formatTemperature(selected.brightnessTemperature)} />
                  <Readout label="FRP" value={formatPower(selected.frp)} />
                  <Readout label="Confidence" value={`${selected.confidence}%`} />
                  <Readout label="Persistence" value={`${selected.persistenceDays} day(s)`} />
                  <Readout
                    label="Nearest industry"
                    value={
                      selected.distanceToFacilityM != null
                        ? formatDistance(selected.distanceToFacilityM)
                        : 'none on record'
                    }
                  />
                  {selected.industrialFacility ? (
                    <Readout
                      label="Facility"
                      value={selected.industrialFacility.name}
                      mono={false}
                    />
                  ) : null}
                  <Readout
                    label="In geofence"
                    value={selected.inBhopalBoundary ? 'yes (ST_Within)' : 'no'}
                  />
                </ReadoutList>

                <button
                  type="button"
                  onClick={() => router.push(`/dashboard/hotspots/${selected.id}`)}
                  className="tims-nav-item w-full border border-rust bg-rust/12 px-2 py-1.5 text-[11px] text-rust hover:bg-rust/20"
                >
                  Open full investigation →
                </button>
              </PanelBody>
            </Panel>
          ) : null}

          <Panel className="border-0 border-b">
            <PanelHeader label="Layers" />
            <MapControls layers={layers} onChange={setLayers} counts={counts} />
          </Panel>

          <Panel className="border-0">
            <PanelHeader label="Geofence" />
            <PanelBody>
              <ReadoutList>
                <Readout label="District" value={boundary.data?.name ?? '—'} mono={false} />
                <Readout
                  label="Area"
                  value={boundary.data ? `${boundary.data.areaKm2.toLocaleString('en-IN')} km²` : '—'}
                />
                <Readout
                  label="Fetch bbox"
                  value={`${BHOPAL_BBOX.minLng},${BHOPAL_BBOX.minLat} → ${BHOPAL_BBOX.maxLng},${BHOPAL_BBOX.maxLat}`}
                />
                <Readout label="Source" value={boundary.data?.source ?? '—'} mono={false} />
                <Readout label="Licence" value={boundary.data?.license ?? '—'} />
              </ReadoutList>
              <Caveat className="mt-2">
                The polygon is the authoritative geofence. The bounding box is only a pre-filter for
                requesting data from NASA FIRMS and Overpass.
              </Caveat>
              <Caveat className="mt-1.5">{DISCLAIMERS.decisionSupport}</Caveat>
            </PanelBody>
          </Panel>
        </aside>
      </div>
    </>
  );
}
