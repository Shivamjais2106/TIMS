'use client';

import 'leaflet/dist/leaflet.css';

import L from 'leaflet';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { EVENT_TYPE_META, FACILITY_TYPE_META, MAP_DEFAULTS, RISK_META } from '@/lib/constants';
import { cn } from '@/lib/utils';
import type { Hotspot, IndustrialFacility } from '@/types';
import { HotspotPopup } from './HotspotPopup';

export interface ThermalMapProps {
  hotspots: Hotspot[];
  facilities?: IndustrialFacility[];
  showHotspots?: boolean;
  showFacilities?: boolean;
  /** Draws analysis rings around the selected detection. */
  showRadius?: boolean;
  radiusKm?: number;
  selectedHotspotId?: string | null;
  onSelectHotspot?: (hotspot: Hotspot | null) => void;
  /** Pans and zooms to fit the data the first time it arrives. */
  fitToData?: boolean;
  center?: [number, number];
  zoom?: number;
  className?: string;
}

/**
 * Marker radius encodes risk score, so a dense cluster still reads at a glance:
 * a 4 px dot is background noise, a 10 px dot is something to look at.
 */
function radiusForRisk(riskScore: number): number {
  return 4 + (Math.max(0, Math.min(100, riskScore)) / 100) * 6;
}

function buildFacilityIcon(facility: IndustrialFacility): L.DivIcon {
  const meta = FACILITY_TYPE_META[facility.type];
  return L.divIcon({
    className: 'tims-facility-icon',
    html:
      `<span style="display:grid;place-items:center;width:20px;height:20px;border-radius:5px;` +
      `background:${meta.color};color:#fff;font-size:9px;font-weight:700;` +
      `border:1.5px solid rgba(255,255,255,.85);box-shadow:0 1px 4px rgba(0,0,0,.45)">${meta.glyph}</span>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

/** Rendering more than this many points turns panning into a slideshow. */
const MAX_RENDERED_HOTSPOTS = 2000;

export default function ThermalMap({
  hotspots,
  facilities = [],
  showHotspots = true,
  showFacilities = true,
  showRadius = true,
  radiusKm = 10,
  selectedHotspotId = null,
  onSelectHotspot,
  fitToData = false,
  center = MAP_DEFAULTS.center,
  zoom = MAP_DEFAULTS.zoom,
  className,
}: ThermalMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const hotspotLayerRef = useRef<L.LayerGroup | null>(null);
  const facilityLayerRef = useRef<L.LayerGroup | null>(null);
  const radiusLayerRef = useRef<L.LayerGroup | null>(null);
  const popupRef = useRef<L.Popup | null>(null);
  const hasFittedRef = useRef(false);

  // Single DOM node reused by every popup, with React portalling content into
  // it. Avoids mounting hundreds of React trees for hundreds of markers.
  const [popupNode] = useState<HTMLDivElement | null>(() =>
    typeof document === 'undefined' ? null : document.createElement('div'),
  );
  const [selected, setSelected] = useState<Hotspot | null>(null);

  // Latest callback without making it an effect dependency, which would tear
  // down and rebuild every marker whenever the parent re-renders.
  const onSelectRef = useRef(onSelectHotspot);
  onSelectRef.current = onSelectHotspot;

  const visibleHotspots = useMemo(() => {
    if (hotspots.length <= MAX_RENDERED_HOTSPOTS) return hotspots;
    // Keep the highest-risk detections when over the cap — dropping critical
    // events to draw more low-risk noise would be the wrong trade.
    return [...hotspots].sort((a, b) => b.riskScore - a.riskScore).slice(0, MAX_RENDERED_HOTSPOTS);
  }, [hotspots]);

  // --- Map lifecycle --------------------------------------------------------
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center,
      zoom,
      minZoom: MAP_DEFAULTS.minZoom,
      maxZoom: MAP_DEFAULTS.maxZoom,
      zoomControl: true,
      attributionControl: true,
      preferCanvas: true,
      worldCopyJump: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors | Thermal data: NASA FIRMS',
      maxZoom: MAP_DEFAULTS.maxZoom,
    }).addTo(map);

    radiusLayerRef.current = L.layerGroup().addTo(map);
    hotspotLayerRef.current = L.layerGroup().addTo(map);
    facilityLayerRef.current = L.layerGroup().addTo(map);

    popupRef.current = L.popup({ closeButton: true, autoPan: true, maxWidth: 320, offset: [0, -4] });

    map.on('popupclose', () => {
      setSelected(null);
      onSelectRef.current?.(null);
    });

    mapRef.current = map;

    // Leaflet mis-measures if the container was hidden or animating on mount.
    const timer = setTimeout(() => map.invalidateSize(), 120);

    return () => {
      clearTimeout(timer);
      map.remove();
      mapRef.current = null;
    };
    // Intentionally mount-only: centre/zoom changes are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Hotspot markers ------------------------------------------------------
  useEffect(() => {
    const layer = hotspotLayerRef.current;
    const map = mapRef.current;
    if (!layer || !map) return;

    layer.clearLayers();
    if (!showHotspots) return;

    for (const hotspot of visibleHotspots) {
      const event = EVENT_TYPE_META[hotspot.eventType];
      const risk = RISK_META[hotspot.riskLevel];
      const isCritical = hotspot.riskLevel === 'CRITICAL';

      const marker = L.circleMarker([hotspot.latitude, hotspot.longitude], {
        radius: radiusForRisk(hotspot.riskScore),
        color: risk.color,
        // A thicker ring marks a long-lived source without adding a new colour.
        weight: hotspot.persistenceDays >= 7 ? 2 : 1,
        opacity: 0.9,
        fillColor: event.color,
        fillOpacity: isCritical ? 0.85 : 0.6,
        bubblingMouseEvents: false,
      });

      marker.on('click', () => {
        setSelected(hotspot);
        onSelectRef.current?.(hotspot);
        if (popupRef.current && popupNode) {
          popupRef.current.setLatLng([hotspot.latitude, hotspot.longitude]).setContent(popupNode).openOn(map);
        }
      });

      marker.bindTooltip(
        `${event.shortLabel} · risk ${hotspot.riskScore.toFixed(0)}`,
        { direction: 'top', offset: [0, -6], className: 'tims-tooltip' },
      );

      layer.addLayer(marker);
    }
  }, [visibleHotspots, showHotspots, popupNode]);

  // --- Facility markers -----------------------------------------------------
  useEffect(() => {
    const layer = facilityLayerRef.current;
    if (!layer) return;

    layer.clearLayers();
    if (!showFacilities) return;

    for (const facility of facilities) {
      const marker = L.marker([facility.latitude, facility.longitude], {
        icon: buildFacilityIcon(facility),
        title: facility.name,
        riseOnHover: true,
      });

      marker.bindTooltip(
        `<strong>${facility.name}</strong><br/>${FACILITY_TYPE_META[facility.type].label} · ${facility.location}`,
        { direction: 'top', offset: [0, -12], className: 'tims-tooltip' },
      );

      layer.addLayer(marker);
    }
  }, [facilities, showFacilities]);

  // --- Analysis rings around the selected detection -------------------------
  useEffect(() => {
    const layer = radiusLayerRef.current;
    if (!layer) return;

    layer.clearLayers();
    const target = selected ?? visibleHotspots.find((hotspot) => hotspot.id === selectedHotspotId) ?? null;
    if (!target || !showRadius) return;

    const center: [number, number] = [target.latitude, target.longitude];
    const risk = RISK_META[target.riskLevel];

    // Three rings at 1/2 and 1x the analysis radius plus the 2 km industrial
    // proximity threshold the classifier itself uses.
    const rings = [
      { radiusMeters: 2000, dash: '2 6', opacity: 0.5 },
      { radiusMeters: (radiusKm * 1000) / 2, dash: '6 8', opacity: 0.35 },
      { radiusMeters: radiusKm * 1000, dash: undefined, opacity: 0.25 },
    ];

    for (const ring of rings) {
      layer.addLayer(
        L.circle(center, {
          radius: ring.radiusMeters,
          color: risk.color,
          weight: 1,
          opacity: ring.opacity,
          dashArray: ring.dash,
          fillColor: risk.color,
          fillOpacity: 0.05,
          interactive: false,
        }),
      );
    }
  }, [selected, selectedHotspotId, visibleHotspots, showRadius, radiusKm]);

  // --- Fit to data on first load -------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !fitToData || hasFittedRef.current) return;

    const points: L.LatLngExpression[] = [
      ...visibleHotspots.map((hotspot) => [hotspot.latitude, hotspot.longitude] as [number, number]),
      ...facilities.map((facility) => [facility.latitude, facility.longitude] as [number, number]),
    ];
    if (points.length === 0) return;

    map.fitBounds(L.latLngBounds(points).pad(0.12), { animate: false });
    hasFittedRef.current = true;
  }, [visibleHotspots, facilities, fitToData]);

  // --- Externally driven selection (e.g. clicking a table row) --------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedHotspotId) return;

    const target = hotspots.find((hotspot) => hotspot.id === selectedHotspotId);
    if (!target) return;

    setSelected(target);
    map.setView([target.latitude, target.longitude], Math.max(map.getZoom(), 11), { animate: true });

    if (popupRef.current && popupNode) {
      popupRef.current.setLatLng([target.latitude, target.longitude]).setContent(popupNode).openOn(map);
    }
  }, [selectedHotspotId, hotspots, popupNode]);

  return (
    <div className={cn('relative size-full', className)}>
      <div ref={containerRef} className="size-full" role="application" aria-label="Thermal hotspot map" />

      {hotspots.length > MAX_RENDERED_HOTSPOTS ? (
        <p className="pointer-events-none absolute bottom-2 left-2 z-[500] rounded bg-surface/90 px-2 py-1 text-[10px] text-fg-subtle ring-1 ring-inset ring-line">
          Showing the {MAX_RENDERED_HOTSPOTS.toLocaleString('en-IN')} highest-risk of{' '}
          {hotspots.length.toLocaleString('en-IN')} detections
        </p>
      ) : null}

      {popupNode && selected ? createPortal(<HotspotPopup hotspot={selected} />, popupNode) : null}
    </div>
  );
}
