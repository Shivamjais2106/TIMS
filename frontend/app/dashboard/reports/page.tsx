import type { Metadata } from 'next';
import { ReportsClient } from './ReportsClient';

export const metadata: Metadata = {
  title: 'Reports',
  description: 'Generate and review situation reports for the Bhopal pilot area.',
};

export default function ReportsPage() {
  return <ReportsClient />;
}
