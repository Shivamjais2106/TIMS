import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoadingState } from '@/components/ui/LoadingState';
import { MapClient } from './MapClient';

export const metadata: Metadata = {
  title: 'Thermal Map',
  description: 'Interactive geospatial view of thermal detections and industrial facilities.',
};

export default function MapPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading map workspace" minHeight={480} />}>
      <MapClient />
    </Suspense>
  );
}
