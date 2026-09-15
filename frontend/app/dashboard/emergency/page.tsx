import type { Metadata } from 'next';
import { EmergencyClient } from './EmergencyClient';

export const metadata: Metadata = {
  title: 'Emergency resources',
  description: 'Fire stations, hospitals, schools and police posts inside the Bhopal pilot area.',
};

export default function EmergencyPage() {
  return <EmergencyClient />;
}
