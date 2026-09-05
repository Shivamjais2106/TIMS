'use client';

import dynamic from 'next/dynamic';
import { LoadingState } from '../ui/LoadingState';
import type { ThermalMapProps } from './ThermalMap';

/**
 * SSR-safe wrapper.
 *
 * Leaflet reaches for `window` at import time, so the map is loaded only in the
 * browser. Everything else about the page still renders on the server.
 */
const ThermalMap = dynamic(() => import('./ThermalMap'), {
  ssr: false,
  loading: () => (
    <div className="grid size-full place-items-center bg-surface-2">
      <LoadingState label="Initialising map" minHeight={0} />
    </div>
  ),
});

export function MapView(props: ThermalMapProps) {
  return <ThermalMap {...props} />;
}
