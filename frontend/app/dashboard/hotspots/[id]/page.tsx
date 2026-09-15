import type { Metadata } from 'next';
import { InvestigationClient } from './InvestigationClient';

export const metadata: Metadata = {
  title: 'Hotspot investigation',
  description: 'Detection detail, risk breakdown, impact zones and nearest emergency resources.',
};

/**
 * Next 15+ passes route params as a Promise, so the page is async and awaits
 * them before handing the id to the client component.
 */
export default async function HotspotDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <InvestigationClient hotspotId={id} />;
}
