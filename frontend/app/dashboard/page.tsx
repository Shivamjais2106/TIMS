import type { Metadata } from 'next';
import { OverviewClient } from './OverviewClient';

export const metadata: Metadata = {
  title: 'Overview',
  description: 'Thermal activity overview across all monitored industrial regions.',
};

export default function DashboardPage() {
  return <OverviewClient />;
}
