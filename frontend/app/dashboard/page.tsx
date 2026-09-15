import type { Metadata } from 'next';
import { OverviewClient } from './OverviewClient';

export const metadata: Metadata = {
  title: 'Overview',
  description: 'Bhopal thermal monitoring overview — detections, risk and live alerts.',
};

export default function DashboardPage() {
  return <OverviewClient />;
}
