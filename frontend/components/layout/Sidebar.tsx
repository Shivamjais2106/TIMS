'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_ITEMS } from '@/lib/constants';
import { PILOT } from '@/lib/bhopal';
import { cn } from '@/lib/utils';
import { Wordmark } from './Logo';

/**
 * Navigation rail.
 *
 * Each item carries a three-letter mono channel code alongside its name, the
 * way a physical instrument labels its inputs. The active item is marked by a
 * 2px rust left border rather than a filled pill.
 */
export function Sidebar({
  unreadAlerts,
  onNavigate,
  className,
}: {
  unreadAlerts?: number;
  /** Called after a link is followed, so the mobile drawer can close itself. */
  onNavigate?: () => void;
  className?: string;
}) {
  const pathname = usePathname();

  return (
    <nav
      className={cn('flex h-full flex-col border-r border-line bg-surface', className)}
      aria-label="Main navigation"
    >
      <div className="flex h-12 flex-none items-center border-b border-line px-3">
        <Wordmark href="/dashboard" />
      </div>

      <ul className="flex-1 overflow-y-auto py-1">
        {NAV_ITEMS.map((item) => {
          // Exact match for the dashboard root, prefix match elsewhere, so
          // /dashboard does not stay highlighted on every sub-route.
          const active =
            item.href === '/dashboard' ? pathname === item.href : pathname.startsWith(item.href);

          const badge = item.href === '/dashboard/alerts' ? unreadAlerts : undefined;

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'tims-nav-item flex items-center gap-2.5 border-l-2 px-3 py-[7px]',
                  active
                    ? 'border-l-rust bg-surface-2 text-fg'
                    : 'border-l-transparent text-fg-muted hover:bg-surface-2 hover:text-fg',
                )}
              >
                <span
                  className={cn(
                    'tims-data w-[26px] flex-none text-[10px] tracking-[0.08em]',
                    active ? 'text-rust' : 'text-fg-subtle',
                  )}
                >
                  {item.code}
                </span>
                <span className="flex-1 truncate text-[12px]">{item.label}</span>

                {badge && badge > 0 ? (
                  <span
                    className="tims-data flex-none border border-rust px-1 text-[10px] leading-[14px] text-rust"
                    aria-label={`${badge} unread alerts`}
                  >
                    {badge > 99 ? '99+' : badge}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="flex-none border-t border-line px-3 py-2">
        <p className="tims-label">Pilot area</p>
        <p className="tims-data mt-0.5 text-[11px] text-fg-muted">
          {PILOT.label}, {PILOT.state}
        </p>
        <p className="mt-1.5 text-[9px] leading-snug text-fg-subtle">
          Decision support only. Not an official emergency alerting system.
        </p>
      </div>
    </nav>
  );
}
