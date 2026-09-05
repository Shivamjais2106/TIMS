'use client';

import { Check, Clock, MapPin } from 'lucide-react';
import Link from 'next/link';
import { RISK_META } from '@/lib/constants';
import { formatCoordinatePair, formatRelativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Alert } from '@/types';

interface AlertCardProps {
  alert: Alert;
  onMarkRead?: (id: string) => void;
  /** Dense variant used in the dashboard sidebar. */
  compact?: boolean;
  busy?: boolean;
}

export function AlertCard({ alert, onMarkRead, compact = false, busy = false }: AlertCardProps) {
  const meta = RISK_META[alert.severity];

  return (
    <article
      className={cn(
        'relative rounded-lg border border-line bg-surface transition-colors',
        alert.isRead ? 'opacity-70' : '',
        compact ? 'p-3' : 'p-4',
      )}
    >
      {/* Severity rail: the fastest way to triage a long list. */}
      <span
        className="absolute inset-y-2 left-0 w-0.5 rounded-full"
        style={{ backgroundColor: meta.color, opacity: alert.isRead ? 0.4 : 1 }}
        aria-hidden
      />

      <div className="pl-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                style={{ backgroundColor: `${meta.color}1f`, color: meta.color }}
              >
                {meta.label}
              </span>
              {!alert.isRead ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-primary">
                  <span className="size-1.5 rounded-full bg-primary" aria-hidden />
                  Unread
                </span>
              ) : null}
            </div>

            <h3 className={cn('mt-1.5 font-medium text-fg', compact ? 'text-xs' : 'text-sm')}>{alert.title}</h3>

            {compact ? null : <p className="mt-1 text-xs leading-relaxed text-fg-muted">{alert.message}</p>}
          </div>

          {onMarkRead && !alert.isRead ? (
            <button
              type="button"
              onClick={() => onMarkRead(alert.id)}
              disabled={busy}
              className="grid size-7 shrink-0 place-items-center rounded-md text-fg-subtle ring-1 ring-inset ring-line transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-50"
              aria-label="Mark as read"
              title="Mark as read"
            >
              <Check className="size-3.5" aria-hidden />
            </button>
          ) : null}
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-fg-subtle">
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3" aria-hidden />
            {formatRelativeTime(alert.createdAt)}
          </span>

          {alert.hotspot ? (
            <Link
              href={`/dashboard/map?focus=${alert.hotspot.id}`}
              className="tims-data inline-flex items-center gap-1 hover:text-primary hover:underline"
            >
              <MapPin className="size-3" aria-hidden />
              {formatCoordinatePair(alert.hotspot.latitude, alert.hotspot.longitude)}
            </Link>
          ) : null}

          {alert.hotspot?.industrialFacility ? (
            <span className="truncate">{alert.hotspot.industrialFacility.name}</span>
          ) : null}
        </div>
      </div>
    </article>
  );
}
