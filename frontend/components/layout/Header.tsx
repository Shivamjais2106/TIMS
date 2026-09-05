'use client';

import { LogOut, Menu, RefreshCw, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { ThemeToggle } from './ThemeToggle';

interface HeaderProps {
  title: string;
  subtitle?: string;
  unreadAlerts?: number;
  onOpenNav: () => void;
  onRefresh?: () => void;
}

export function Header({ title, subtitle, unreadAlerts = 0, onOpenNav, onRefresh }: HeaderProps) {
  const { user, demo, logout } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  const initials = (user?.name ?? '?')
    .split(' ')
    .map((part) => part.charAt(0))
    .slice(0, 2)
    .join('')
    .toUpperCase();

  async function handleLogout() {
    setSigningOut(true);
    await logout();
    setSigningOut(false);
  }

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-surface/85 backdrop-blur">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
        <button
          type="button"
          onClick={onOpenNav}
          className="grid size-9 place-items-center rounded-lg text-fg-muted ring-1 ring-inset ring-line hover:bg-surface-3 lg:hidden"
          aria-label="Open navigation"
        >
          <Menu className="size-4" aria-hidden />
        </button>

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold tracking-tight text-fg">{title}</h1>
          {subtitle ? <p className="truncate text-xs text-fg-muted">{subtitle}</p> : null}
        </div>

        {demo ? (
          <span className="hidden items-center gap-1.5 rounded-md bg-amber-500/12 px-2 py-1 text-[11px] font-medium text-amber-600 ring-1 ring-inset ring-amber-500/30 dark:text-amber-300 sm:inline-flex">
            <TriangleAlert className="size-3.5" aria-hidden />
            Demo data — API offline
          </span>
        ) : null}

        {onRefresh ? (
          <button
            type="button"
            onClick={onRefresh}
            className="grid size-9 place-items-center rounded-lg text-fg-muted ring-1 ring-inset ring-line transition-colors hover:bg-surface-3 hover:text-fg"
            aria-label="Refresh data"
          >
            <RefreshCw className="size-4" aria-hidden />
          </button>
        ) : null}

        <Link
          href="/dashboard/alerts"
          className="relative grid size-9 place-items-center rounded-lg text-fg-muted ring-1 ring-inset ring-line transition-colors hover:bg-surface-3 hover:text-fg"
          aria-label={`Alerts${unreadAlerts > 0 ? `, ${unreadAlerts} unread` : ''}`}
        >
          <TriangleAlert className="size-4" aria-hidden />
          {unreadAlerts > 0 ? (
            <span className="absolute -right-1 -top-1 grid min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-4 text-white">
              {unreadAlerts > 9 ? '9+' : unreadAlerts}
            </span>
          ) : null}
        </Link>

        <ThemeToggle />

        <div className="ml-1 flex items-center gap-2.5 border-l border-line pl-3">
          <span
            className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary"
            aria-hidden
          >
            {initials}
          </span>
          <div className="hidden min-w-0 leading-tight sm:block">
            <p className="truncate text-xs font-medium text-fg">{user?.name ?? 'Signed out'}</p>
            <p className="truncate text-[10px] uppercase tracking-wide text-fg-subtle">{user?.role ?? '—'}</p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            disabled={signingOut}
            className={cn(
              'grid size-9 place-items-center rounded-lg text-fg-muted transition-colors',
              'hover:bg-red-500/10 hover:text-red-500 disabled:opacity-50',
            )}
            aria-label="Sign out"
          >
            <LogOut className="size-4" aria-hidden />
          </button>
        </div>
      </div>
    </header>
  );
}
