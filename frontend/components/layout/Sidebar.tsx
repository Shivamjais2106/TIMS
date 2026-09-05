'use client';

import {
  BellRing,
  ChartColumn,
  Factory,
  Flame,
  LayoutDashboard,
  Map as MapIcon,
  Satellite,
  X,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_ITEMS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { Wordmark } from './Logo';

const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard,
  Map: MapIcon,
  Flame,
  Factory,
  ChartColumn,
  BellRing,
};

interface SidebarProps {
  /** Unread alert count, rendered as a badge on the Alerts item. */
  unreadAlerts?: number;
  /** Mobile drawer state. On desktop the sidebar is always visible. */
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ unreadAlerts = 0, open, onClose }: SidebarProps) {
  const pathname = usePathname();

  return (
    <>
      {/* Mobile scrim */}
      <div
        className={cn(
          'fixed inset-0 z-30 bg-black/60 backdrop-blur-sm transition-opacity lg:hidden',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={onClose}
        aria-hidden
      />

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-line bg-surface',
          'transition-transform duration-200 lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-line px-5">
          <Link href="/dashboard" className="rounded-md" onClick={onClose}>
            <Wordmark />
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-md text-fg-muted hover:bg-surface-3 lg:hidden"
            aria-label="Close navigation"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3" aria-label="Main">
          <p className="px-3 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-subtle">
            Monitoring
          </p>

          {NAV_ITEMS.map((item) => {
            const Icon = ICONS[item.icon] ?? LayoutDashboard;
            // Exact match for the overview so it does not stay lit on children.
            const active = item.href === '/dashboard' ? pathname === item.href : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                  active
                    ? 'bg-primary/10 font-medium text-primary'
                    : 'text-fg-muted hover:bg-surface-3 hover:text-fg',
                )}
              >
                {active ? (
                  <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary" aria-hidden />
                ) : null}
                <Icon className="size-4 shrink-0" aria-hidden />
                <span className="flex-1 truncate">{item.label}</span>
                {item.href === '/dashboard/alerts' && unreadAlerts > 0 ? (
                  <span className="tims-data rounded-full bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-red-500">
                    {unreadAlerts > 99 ? '99+' : unreadAlerts}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-line p-3">
          <div className="rounded-lg bg-surface-2 p-3">
            <div className="flex items-center gap-2 text-primary">
              <Satellite className="size-3.5" aria-hidden />
              <p className="text-[11px] font-semibold uppercase tracking-wide">Data sources</p>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-fg-subtle">
              NASA FIRMS (VIIRS / MODIS) thermal anomalies fused with OpenStreetMap industrial geometry.
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}
