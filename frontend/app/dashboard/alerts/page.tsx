import type { Metadata } from 'next';
import { AlertsClient } from './AlertsClient';

export const metadata: Metadata = {
  title: 'Alerts',
  description: 'Automatically raised notifications requiring analyst review.',
};

export default function AlertsPage() {
  return <AlertsClient />;
}
