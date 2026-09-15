import type { Metadata } from 'next';
import { IndustriesClient } from './IndustriesClient';

export const metadata: Metadata = {
  title: 'Industrial facilities',
  description: 'Register of industrial sites mapped inside the Bhopal pilot area.',
};

export default function IndustriesPage() {
  return <IndustriesClient />;
}
