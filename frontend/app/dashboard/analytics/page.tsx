import type { Metadata } from 'next';
import { AnalyticsClient } from './AnalyticsClient';

export const metadata: Metadata = {
  title: 'Analytics',
  description: 'Trends, classification breakdowns and regional distribution of thermal events.',
};

export default function AnalyticsPage() {
  return <AnalyticsClient />;
}
