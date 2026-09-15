'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRealtime } from '@/hooks/useRealtime';
import { SEVERITY_META } from '@/lib/constants';
import { formatRelativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { LiveIndicator } from '@/components/ui/Indicators';
import { ThemeToggle } from './ThemeToggle';

/**
 * Console header: page title, live clock, connection state, notification bell.
 *
 * The bell is driven by the Socket.io stream rather than by polling, so a new
 * alert appears without a refresh.
 */
export function Header({
  title,
  subtitle,
  actions,
  onOpenNav,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  onOpenNav?: () => void;
}) {
  const { user, logout } = useAuth();
  const { connected, liveAlerts, unseenCount, markSeen } = useRealtime();
  const [bellOpen, setBellOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close both popovers on an outside click or Escape.
  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(event.target as Node)) setBellOpen(false);
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setBellOpen(false);
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-12 flex-none items-center gap-3 border-b border-line bg-bg/95 px-3 backdrop-blur">
      {onOpenNav ? (
        <button
          type="button"
          onClick={onOpenNav}
          aria-label="Open navigation"
          className="tims-nav-item -ml-1 flex size-7 items-center justify-center border border-line text-fg-muted hover:text-fg lg:hidden"
        >
          <span className="flex flex-col gap-[3px]" aria-hidden>
            <span className="block h-px w-3.5 bg-current" />
            <span className="block h-px w-3.5 bg-current" />
            <span className="block h-px w-3.5 bg-current" />
          </span>
        </button>
      ) : null}

      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[13px] font-medium leading-tight text-fg">{title}</h1>
        {subtitle ? <p className="truncate text-[10px] text-fg-subtle">{subtitle}</p> : null}
      </div>

      <div className="flex flex-none items-center gap-2.5">
        {actions}

        <Clock />

        <span className="hidden h-4 w-px bg-line sm:block" aria-hidden />

        <LiveIndicator connected={connected} className="hidden sm:flex" />

        <ThemeToggle />

        {/* --- Notification bell --------------------------------------- */}
        <div ref={bellRef} className="relative">
          <button
            type="button"
            onClick={() => {
              setBellOpen((open) => !open);
              markSeen();
            }}
            aria-label={`Alerts${unseenCount > 0 ? `, ${unseenCount} new` : ''}`}
            aria-expanded={bellOpen}
            className="tims-nav-item relative flex size-7 items-center justify-center border border-line text-fg-muted hover:border-line-strong hover:text-fg"
          >
            {/* Square bell glyph, drawn rather than imported, to stay in the
                geometric register of the rest of the UI. */}
            <span className="relative block size-3" aria-hidden>
              <span className="absolute inset-x-0 top-0 h-[7px] border border-current" />
              <span className="absolute inset-x-[3px] bottom-0 h-px bg-current" />
            </span>
            {unseenCount > 0 ? (
              <span className="absolute -right-1 -top-1 flex size-[13px] items-center justify-center border border-rust bg-bg">
                <span className="tims-data text-[8px] leading-none text-rust">
                  {unseenCount > 9 ? '9+' : unseenCount}
                </span>
              </span>
            ) : null}
          </button>

          {bellOpen ? (
            <div className="absolute right-0 top-9 z-40 w-[320px] border border-line-strong bg-surface">
              <div className="flex items-center justify-between border-b border-line px-2.5 py-1.5">
                <p className="tims-label">Live alert stream</p>
                <LiveIndicator connected={connected} />
              </div>

              <div className="max-h-[320px] overflow-y-auto">
                {liveAlerts.length === 0 ? (
                  <p className="px-2.5 py-6 text-center text-[11px] text-fg-subtle">
                    {connected
                      ? 'Connected. No alerts pushed since this page loaded.'
                      : 'Not connected to the alert stream.'}
                  </p>
                ) : (
                  liveAlerts.map((alert) => (
                    <Link
                      key={alert.id}
                      href="/dashboard/alerts"
                      prefetch={false}
                      onClick={() => setBellOpen(false)}
                      className="tims-row block border-b border-line/70 px-2.5 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="tims-led"
                          style={{ background: SEVERITY_META[alert.severity].color }}
                          aria-hidden
                        />
                        <span
                          className="tims-data text-[10px]"
                          style={{ color: SEVERITY_META[alert.severity].color }}
                        >
                          {alert.severity}
                        </span>
                        <span className="tims-data ml-auto text-[10px] text-fg-subtle">
                          {formatRelativeTime(alert.createdAt)}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-fg">
                        {alert.title}
                      </p>
                    </Link>
                  ))
                )}
              </div>

              <Link
                href="/dashboard/alerts"
                onClick={() => setBellOpen(false)}
                className="tims-nav-item block border-t border-line px-2.5 py-1.5 text-center text-[11px] text-fg-muted hover:text-fg"
              >
                Open alert register →
              </Link>
            </div>
          ) : null}
        </div>

        {/* --- User menu ------------------------------------------------ */}
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-label="Account menu"
            className="tims-nav-item flex items-center gap-1.5 border border-line px-1.5 py-1 text-fg-muted hover:border-line-strong hover:text-fg"
          >
            <span className="tims-data text-[10px]">
              {user ? initials(user.name) : '—'}
            </span>
            <span className="hidden text-[10px] text-fg-subtle sm:inline">{user?.role ?? ''}</span>
          </button>

          {menuOpen ? (
            <div className="absolute right-0 top-9 z-40 w-[220px] border border-line-strong bg-surface">
              <div className="border-b border-line px-2.5 py-2">
                <p className="truncate text-[12px] text-fg">{user?.name ?? 'Signed out'}</p>
                <p className="tims-data truncate text-[10px] text-fg-subtle">{user?.email ?? ''}</p>
                {user ? (
                  <p className="tims-label mt-1" style={{ color: '#6b9e7a' }}>
                    {user.role}
                  </p>
                ) : null}
              </div>
              <Link
                href="/dashboard/settings"
                onClick={() => setMenuOpen(false)}
                className="tims-nav-item block px-2.5 py-1.5 text-[11px] text-fg-muted hover:bg-surface-2 hover:text-fg"
              >
                Settings
              </Link>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  void logout();
                }}
                className="tims-nav-item block w-full px-2.5 py-1.5 text-left text-[11px] text-fg-muted hover:bg-surface-2 hover:text-rust"
              >
                Sign out
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

/**
 * Live IST clock.
 *
 * Renders nothing until mounted: a server-rendered time would differ from the
 * client's first paint and produce a hydration mismatch on every load.
 */
function Clock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <span
      className={cn('tims-data hidden text-[11px] text-fg-muted md:inline', !now && 'opacity-0')}
      title="Asia/Kolkata"
    >
      {now
        ? new Intl.DateTimeFormat('en-GB', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
            timeZone: 'Asia/Kolkata',
          }).format(now)
        : '00:00:00'}
      <span className="ml-1 text-fg-subtle">IST</span>
    </span>
  );
}
