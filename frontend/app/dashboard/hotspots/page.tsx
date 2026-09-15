import type { Metadata } from 'next';
import { HotspotsClient } from './HotspotsClient';

export const metadata: Metadata = {
  title: 'Hotspot register',
  description: 'Filterable, sortable register of every thermal detection in the Bhopal pilot area.',
};

export default function HotspotsPage() {
  return <HotspotsClient />;
}
