'use client';

import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useMemo, useRef } from 'react';
import {
  Circle,
  GeoJSON,
  LayerGroup,
  MapContainer,
  Marker,
  Polygon,
  TileLayer,
  Tooltip,
  useMap,
} from 'react-leaflet';
import { BHOPAL_BBOX, MAP_DEFAULTS } from '@/lib/bhopal';
import {
  EMERGENCY_TYPE_META,
  FACILITY_TYPE_META,
  riskColor,
  RISK_META,
  THERMAL_CLASS_META,
} from '@/lib/constants';
import { useTheme, type Palette, type ResolvedTheme } from '@/hooks/useTheme';
import { formatCoordinatePair, formatDateTimeShort, formatDistance, formatPower } from '@/lib/format';
import type {
  BoundaryResponse,
  EmergencyFacility,
  Hotspot,
  IndustrialFacility,
} from '@/types';

/**
 * Bhopal thermal map.
 *
 * Detections are square divIcons sized by risk, because a satellite detection
 * *is* a square pixel on a grid, and it distinguishes them instantly from the
 * circular facility markers. Marker colour comes from the shared risk table so
 * the map, the legend and every chart agree.
 *
 * react-leaflet is used rather than hand-rolled Leaflet so layer toggling is
 * declarative and React owns the lifecycle.
 */

export interface MapLayers {
  hotspots: boolean;
  industry: boolean;
  hospitals: boolean;
  fireStations: boolean;
  schools: boolean;
  boundary: boolean;
  fetchBbox: boolean;
  impactZones: boolean;
}

export const DEFAULT_LAYERS: MapLayers = {
  hotspots: true,
  industry: true,
  hospitals: false,
  fireStations: true,
  schools: false,
  boundary: true,
  fetchBbox: false,
  impactZones: false,
};

/** Detection marker size in px, by risk level. */
const MARKER_SIZE: Record<string, number> = {
  LOW: 7,
  MEDIUM: 9,
  HIGH: 11,
  CRITICAL: 13,
};

function hotspotIcon(hotspot: Hotspot, theme: ResolvedTheme, palette: Palette): L.DivIcon {
  const size = MARKER_SIZE[hotspot.riskLevel] ?? 8;
  const color = riskColor(hotspot.riskLevel, theme);
  // Only CRITICAL pulses. One moving element on a map of a thousand reads as a
  // signal; a thousand moving elements read as noise.
  const pulse = hotspot.riskLevel === 'CRITICAL' ? ' tims-marker-pulse' : '';

  return L.divIcon({
    className: '',
    html: `<span class="tims-marker tims-marker-square${pulse}" style="width:${size}px;height:${size}px;background:${color};color:${color};border-color:${palette.markerBorder}"></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function facilityIcon(color: string, glyph: string, palette: Palette): L.DivIcon {
  return L.divIcon({
    className: '',
    // Substrate-filled so the glyph reads as a cut-out in both themes.
    html: `<span class="tims-marker tims-marker-round" style="width:11px;height:11px;background:${palette.surface};border-color:${color};display:grid;place-items:center"><span style="font:600 7px/1 'IBM Plex Mono',monospace;color:${color}">${glyph}</span></span>`,
    iconSize: [11, 11],
    iconAnchor: [5.5, 5.5],
  });
}

/** Keeps the Leaflet canvas sized correctly when its container changes. */
function ResizeHandler() {
  const map = useMap();

  useEffect(() => {
    // Leaflet caches container size at init. Inside a flex dashboard shell the
    // panel is often still growing at that point, which leaves the map with a
    // stale size and grey tiles until the first user interaction.
    const invalidate = () => map.invalidateSize();
    const timer = window.setTimeout(invalidate, 120);

    const observer = new ResizeObserver(invalidate);
    observer.observe(map.getContainer());

    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [map]);

  return null;
}

/** Recentres when a caller selects a detection from a list. */
function FocusHandler({ focus }: { focus: [number, number] | null }) {
  const map = useMap();
  const previous = useRef<string | null>(null);

  useEffect(() => {
    if (!focus) return;
    const key = focus.join(',');
    if (previous.current === key) return;
    previous.current = key;
    map.flyTo(focus, Math.max(map.getZoom(), 14), { duration: 0.6 });
  }, [focus, map]);

  return null;
}

/** Keeps the first occurrence of each id. See the note in ThermalMap. */
function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

export function ThermalMap({
  hotspots,
  facilities = [],
  emergencyFacilities = [],
  boundary,
  layers = DEFAULT_LAYERS,
  focus = null,
  selectedId = null,
  onSelectHotspot,
  impactCenter = null,
  impactRadiiKm = [1, 3, 5],
  className,
}: {
  hotspots: Hotspot[];
  facilities?: IndustrialFacility[];
  emergencyFacilities?: EmergencyFacility[];
  boundary?: BoundaryResponse | null;
  layers?: MapLayers;
  focus?: [number, number] | null;
  selectedId?: string | null;
  onSelectHotspot?: (hotspot: Hotspot) => void;
  impactCenter?: [number, number] | null;
  impactRadiiKm?: number[];
  className?: string;
}) {
  const { theme, palette } = useTheme();

  // Callers legitimately assemble marker lists from several overlapping
  // queries — the investigation page, for example, combines "nearest hospital"
  // with "every receptor within 1 km", and the nearest hospital is usually in
  // both. De-duplicating here rather than at each call site means no caller can
  // produce a duplicate React key, and the first occurrence wins so a facility
  // fetched with a distance (from a nearest-* query) is kept over a bare copy.
  const uniqueEmergency = useMemo(
    () => dedupeById(emergencyFacilities),
    [emergencyFacilities],
  );
  const uniqueFacilities = useMemo(() => dedupeById(facilities), [facilities]);
  const uniqueHotspots = useMemo(() => dedupeById(hotspots), [hotspots]);

  const boundaryGeoJson = useMemo(() => {
    if (!boundary?.simplifiedGeoJson) return null;
    return {
      type: 'Feature' as const,
      properties: { name: boundary.name },
      geometry: boundary.simplifiedGeoJson,
    };
  }, [boundary]);

  // The fetch envelope drawn as a rectangle, so the distinction between the
  // bbox TIMS requests from NASA and the polygon it actually geofences with is
  // visible rather than merely described.
  const bboxCorners = useMemo<L.LatLngExpression[]>(
    () => [
      [BHOPAL_BBOX.minLat, BHOPAL_BBOX.minLng],
      [BHOPAL_BBOX.minLat, BHOPAL_BBOX.maxLng],
      [BHOPAL_BBOX.maxLat, BHOPAL_BBOX.maxLng],
      [BHOPAL_BBOX.maxLat, BHOPAL_BBOX.minLng],
    ],
    [],
  );

  return (
    <MapContainer
      center={MAP_DEFAULTS.center as [number, number]}
      zoom={MAP_DEFAULTS.zoom}
      minZoom={MAP_DEFAULTS.minZoom}
      maxZoom={MAP_DEFAULTS.maxZoom}
      zoomControl
      attributionControl
      className={className}
      style={{ height: '100%', width: '100%' }}
    >
      <ResizeHandler />
      <FocusHandler focus={focus} />

      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; OpenStreetMap contributors"
        maxZoom={19}
      />

      {/* --- Geofence --------------------------------------------------- */}
      {layers.boundary && boundaryGeoJson ? (
        <GeoJSON
          key={boundary?.id}
          data={boundaryGeoJson}
          style={{
            color: palette.fgMuted,
            weight: 1,
            fillColor: palette.fg,
            fillOpacity: 0.02,
            dashArray: '4 3',
          }}
        />
      ) : null}

      {layers.fetchBbox ? (
        <Polygon
          positions={bboxCorners}
          pathOptions={{ color: palette.rust, weight: 1, fill: false, dashArray: '2 4' }}
        >
          <Tooltip sticky>
            <span className="tims-data text-[10px]">
              FIRMS fetch envelope — a pre-filter, not the geofence
            </span>
          </Tooltip>
        </Polygon>
      ) : null}

      {/* --- Impact zones ----------------------------------------------- */}
      {layers.impactZones && impactCenter
        ? impactRadiiKm.map((radiusKm) => (
            <Circle
              key={radiusKm}
              center={impactCenter}
              radius={radiusKm * 1000}
              pathOptions={{
                color: palette.rust,
                weight: 1,
                opacity: 0.5,
                fillColor: palette.rust,
                fillOpacity: 0.04,
              }}
            >
              <Tooltip direction="top">
                <span className="tims-data text-[10px]">{radiusKm} km impact zone</span>
              </Tooltip>
            </Circle>
          ))
        : null}

      {/* --- Industrial facilities --------------------------------------- */}
      {layers.industry ? (
        <LayerGroup>
          {uniqueFacilities.map((facility) => (
            <Marker
              key={facility.id}
              position={[facility.latitude, facility.longitude]}
              icon={facilityIcon(FACILITY_TYPE_META[facility.type].color, 'I', palette)}
            >
              <Tooltip direction="top" offset={[0, -6]}>
                <div className="px-1 py-0.5">
                  <p className="text-[11px] font-medium text-fg">{facility.name}</p>
                  <p className="tims-data text-[10px] text-fg-subtle">
                    {FACILITY_TYPE_META[facility.type].label}
                  </p>
                </div>
              </Tooltip>
            </Marker>
          ))}
        </LayerGroup>
      ) : null}

      {/* --- Emergency facilities ---------------------------------------- */}
      <LayerGroup>
        {uniqueEmergency
          .filter((facility) => {
            if (facility.type === 'HOSPITAL') return layers.hospitals;
            if (facility.type === 'FIRE_STATION') return layers.fireStations;
            if (facility.type === 'SCHOOL') return layers.schools;
            return false;
          })
          .map((facility) => {
            const meta = EMERGENCY_TYPE_META[facility.type];
            const glyph =
              facility.type === 'FIRE_STATION' ? 'F' : facility.type === 'HOSPITAL' ? 'H' : 'S';

            return (
              <Marker
                key={facility.id}
                position={[facility.latitude, facility.longitude]}
                icon={facilityIcon(meta.color, glyph, palette)}
              >
                <Tooltip direction="top" offset={[0, -6]}>
                  <div className="px-1 py-0.5">
                    <p className="text-[11px] font-medium text-fg">{facility.name}</p>
                    <p className="tims-data text-[10px] text-fg-subtle">{meta.label}</p>
                  </div>
                </Tooltip>
              </Marker>
            );
          })}
      </LayerGroup>

      {/* --- Detections -------------------------------------------------- */}
      {layers.hotspots ? (
        <LayerGroup>
          {uniqueHotspots.map((hotspot) => (
            <Marker
              key={hotspot.id}
              position={[hotspot.latitude, hotspot.longitude]}
              icon={hotspotIcon(hotspot, theme, palette)}
              zIndexOffset={hotspot.id === selectedId ? 1000 : 0}
              eventHandlers={onSelectHotspot ? { click: () => onSelectHotspot(hotspot) } : undefined}
            >
              <Tooltip direction="top" offset={[0, -6]}>
                <HotspotTooltip hotspot={hotspot} />
              </Tooltip>
            </Marker>
          ))}
        </LayerGroup>
      ) : null}
    </MapContainer>
  );
}

function HotspotTooltip({ hotspot }: { hotspot: Hotspot }) {
  const { theme } = useTheme();
  const risk = RISK_META[hotspot.riskLevel];
  const riskHex = riskColor(hotspot.riskLevel, theme);
  const classMeta = hotspot.mlClass ? THERMAL_CLASS_META[hotspot.mlClass] : null;

  return (
    <div className="min-w-[190px] px-1 py-0.5">
      <div className="flex items-center gap-1.5">
        <span className="tims-led" style={{ background: riskHex }} aria-hidden />
        <span className="tims-data text-[10px]" style={{ color: riskHex }}>
          {risk.label.toUpperCase()} {hotspot.riskScore.toFixed(0)}
        </span>
      </div>

      <p className="mt-1 text-[11px] font-medium leading-tight text-fg">
        {classMeta?.label ?? 'Unclassified'}
      </p>

      <dl className="mt-1 space-y-[1px]">
        <Row label="Detected" value={formatDateTimeShort(hotspot.detectedAt)} />
        <Row label="FRP" value={formatPower(hotspot.frp)} />
        <Row label="Persistence" value={`${hotspot.persistenceDays} d`} />
        {hotspot.distanceToFacilityM != null ? (
          <Row label="To industry" value={formatDistance(hotspot.distanceToFacilityM)} />
        ) : null}
        <Row label="Position" value={formatCoordinatePair(hotspot.latitude, hotspot.longitude)} />
      </dl>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-[9px] text-fg-subtle">{label}</dt>
      <dd className="tims-data text-[10px] text-fg-muted">{value}</dd>
    </div>
  );
}
