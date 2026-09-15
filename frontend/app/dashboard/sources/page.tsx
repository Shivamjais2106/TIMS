import type { Metadata } from 'next';
import { SourcesClient } from './SourcesClient';

export const metadata: Metadata = {
  title: 'Data sources',
  description: 'Every upstream data source TIMS uses, with its real operational status.',
};

export default function SourcesPage() {
  return <SourcesClient />;
}
