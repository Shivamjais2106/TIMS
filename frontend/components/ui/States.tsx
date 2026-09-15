import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Loading, empty, error and degraded states.
 *
 * All plain text on a hairline panel. A monitoring console should never show a
 * decorative illustration where a status line belongs, and an error must state
 * what failed rather than apologise for it.
 */

export function LoadingState({
  label = 'Acquiring',
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center justify-center gap-2 px-3 py-10', className)}>
      {/* Three-bar scanning indicator: reads as an instrument acquiring a
          signal rather than a generic spinner. Animation is defined in
          globals.css so it is covered by the reduced-motion override. */}
      <span className="flex h-3 items-end gap-[2px]" aria-hidden>
        <span className="w-[2px] animate-pulse bg-fg-subtle" style={{ height: '6px' }} />
        <span
          className="w-[2px] animate-pulse bg-fg-muted"
          style={{ height: '11px', animationDelay: '140ms' }}
        />
        <span
          className="w-[2px] animate-pulse bg-fg-subtle"
          style={{ height: '8px', animationDelay: '280ms' }}
        />
      </span>
      <span className="tims-label">{label}</span>
    </div>
  );
}

export function EmptyState({
  title,
  detail,
  action,
  className,
}: {
  title: string;
  detail?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('px-4 py-10 text-center', className)}>
      <p className="tims-label">No data</p>
      <p className="mt-2 text-[13px] text-fg">{title}</p>
      {detail ? (
        <p className="mx-auto mt-1.5 max-w-md text-[11px] leading-relaxed text-fg-subtle">{detail}</p>
      ) : null}
      {action ? <div className="mt-3 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
  className,
}: {
  message: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn('border border-line bg-surface-2 px-3 py-3', className)}
      style={{ borderLeftWidth: 2, borderLeftColor: '#c1502e' }}
      role="alert"
    >
      <p className="tims-label" style={{ color: '#c1502e' }}>
        Error
      </p>
      <p className="mt-1 text-[12px] leading-relaxed text-fg">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="tims-nav-item mt-2 border border-line px-2 py-1 text-[11px] text-fg-muted hover:border-line-strong hover:text-fg"
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}

/**
 * Banner for a degraded-but-working state.
 *
 * Used when TIMS is running while something is unavailable — the model service
 * is down, weather has no provider, demo mode is on. Never decorative.
 */
export function NoticeBanner({
  tone = 'warn',
  label,
  children,
  className,
}: {
  tone?: 'warn' | 'info' | 'danger' | 'ok';
  label: string;
  children: ReactNode;
  className?: string;
}) {
  const color =
    tone === 'danger' ? '#c1502e' : tone === 'warn' ? '#b57340' : tone === 'ok' ? '#6b9e7a' : '#7a8086';

  return (
    <div
      className={cn('flex items-start gap-2.5 border border-line bg-surface px-3 py-2', className)}
      style={{ borderLeftWidth: 2, borderLeftColor: color }}
      role="status"
    >
      <span className="tims-label mt-[3px] flex-none" style={{ color }}>
        {label}
      </span>
      <p className="text-[11px] leading-relaxed text-fg-muted">{children}</p>
    </div>
  );
}

/**
 * Persistent demo-mode banner.
 *
 * Rendered whenever the API reports DEMO_MODE, so a viewer can never mistake
 * sample records for live NASA data.
 */
export function DemoBanner({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 border-b border-line bg-rust/10 px-3 py-1.5',
        className,
      )}
      role="status"
    >
      <span className="tims-label" style={{ color: '#c1502e' }}>
        Demo data
      </span>
      <p className="text-[11px] text-fg-muted">
        This instance is running in DEMO_MODE. Records shown are clearly-labelled samples, not live
        NASA FIRMS detections.
      </p>
    </div>
  );
}
