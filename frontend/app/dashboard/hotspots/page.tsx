import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoadingState } from '@/components/ui/LoadingState';
import { HotspotsClient } from './HotspotsClient';

export const metadata: Metadata = {
  title: 'Hotspots',
  description: 'Searchable register of every thermal detection.',
};

export default function HotspotsPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading hotspot register" minHeight={420} />}>
      <HotspotsClient />
    </Suspense>
  );
}
