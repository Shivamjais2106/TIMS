'use client';

import dynamic from 'next/dynamic';
import { LoadingState } from '@/components/ui/States';
import type { MapLayers } from './ThermalMap';
import type { BoundaryResponse, EmergencyFacility, Hotspot, IndustrialFacility } from '@/types';

/**
 * Client-only wrapper around the Leaflet map.
 *
 * Leaflet touches `window` at import time, so it cannot be server-rendered.
 * This is the single place `ssr: false` is needed, which keeps every page that
 * shows a map free of dynamic-import boilerplate.
 */
const ThermalMap = dynamic(() => import('./ThermalMap').then((module) => module.ThermalMap), {
  ssr: false,
  loading: () => <LoadingState label="Loading map" className="h-full" />,
});

export function MapPanel(props: {
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
  return <ThermalMap {...props} />;
}

export { DEFAULT_LAYERS, type MapLayers } from './ThermalMap';
