import type { Metadata } from 'next';
import { MapClient } from './MapClient';

export const metadata: Metadata = {
  title: 'Live thermal map',
  description: 'Bhopal-centred thermal anomaly map with layer filters and impact zones.',
};

export default function MapPage() {
  return <MapClient />;
}
