import type { Metadata } from 'next';
import { AlertsClient } from './AlertsClient';

export const metadata: Metadata = {
  title: 'Alerts',
  description: 'Real-time alert register with severity filters and analyst triage.',
};

export default function AlertsPage() {
  return <AlertsClient />;
}
