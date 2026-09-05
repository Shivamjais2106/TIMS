import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoadingState } from '@/components/ui/LoadingState';
import { IndustriesClient } from './IndustriesClient';

export const metadata: Metadata = {
  title: 'Industrial Facilities',
  description: 'Monitored refineries, petrochemical plants, terminals, steel works and mines.',
};

export default function IndustriesPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading facilities" minHeight={420} />}>
      <IndustriesClient />
    </Suspense>
  );
}
