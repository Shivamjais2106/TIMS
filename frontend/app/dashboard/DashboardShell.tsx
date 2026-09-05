'use client';

import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { Header } from '@/components/layout/Header';
import { Sidebar } from '@/components/layout/Sidebar';
import { LoadingState } from '@/components/ui/LoadingState';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/hooks/useAuth';
import { alertService } from '@/services/alert.service';

const PAGE_META: Record<string, { title: string; subtitle: string }> = {
  '/dashboard': {
    title: 'Operations Overview',
    subtitle: 'Thermal activity across all monitored industrial regions',
  },
  '/dashboard/map': {
    title: 'Thermal Hotspot Map',
    subtitle: 'Interactive geospatial view of detections and industrial facilities',
  },
  '/dashboard/hotspots': {
    title: 'Hotspot Register',
    subtitle: 'Every thermal detection, filterable and sortable',
  },
  '/dashboard/industries': {
    title: 'Industrial Facilities',
    subtitle: 'Monitored refineries, plants, terminals and mines',
  },
  '/dashboard/analytics': {
    title: 'Analytics',
    subtitle: 'Trends, category breakdowns and regional distribution',
  },
  '/dashboard/alerts': {
    title: 'Alerts',
    subtitle: 'Automatically raised notifications requiring review',
  },
};

/**
 * Chrome shared by every dashboard route.
 *
 * The unread alert count lives here rather than in each page so the sidebar
 * badge and the header bell always agree.
 */
export function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, loading } = useAuth();
  const [navOpen, setNavOpen] = useState(false);

  const unread = useApi(() => alertService.unreadCount(), []);
  const meta = PAGE_META[pathname] ?? { title: 'Dashboard', subtitle: '' };

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-bg">
        <LoadingState label="Restoring session" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="grid min-h-screen place-items-center bg-bg px-6 text-center">
        <div>
          <p className="text-sm font-medium text-fg">Your session has ended</p>
          <p className="mt-1 text-xs text-fg-muted">Sign in again to continue monitoring.</p>
          <a
            href="/login"
            className="mt-4 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg"
          >
            Go to sign in
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg">
      <Sidebar unreadAlerts={unread.data?.total ?? 0} open={navOpen} onClose={() => setNavOpen(false)} />

      <div className="lg:pl-64">
        <Header
          title={meta.title}
          subtitle={meta.subtitle}
          unreadAlerts={unread.data?.total ?? 0}
          onOpenNav={() => setNavOpen(true)}
          onRefresh={unread.refetch}
        />
        <main className="px-4 py-5 sm:px-6 sm:py-6">{children}</main>
      </div>
    </div>
  );
}
