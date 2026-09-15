import type { Metadata } from 'next';
import { AnalyticsClient } from './AnalyticsClient';

export const metadata: Metadata = {
  title: 'Analytics',
  description: 'Detection trends, risk distribution and regional breakdown.',
};

export default function AnalyticsPage() {
  return <AnalyticsClient />;
}
