'use client';

import type { ReactNode } from 'react';
import { useCountUp } from '@/hooks/useGsap';
import { cn } from '@/lib/utils';

/**
 * A single flat statistic.
 *
 * No icon badge — the meaning is carried by a 2px coloured left border and by
 * the label, which is the whole point of the design brief. The number counts
 * up on mount via GSAP, writing textContent directly rather than through React
 * state so a 60fps tween does not re-render the card tree.
 */
export function StatCard({
  label,
  value,
  unit,
  accent = 'neutral',
  decimals = 0,
  delta,
  footnote,
  className,
}: {
  label: string;
  value: number;
  unit?: string;
  /** Left-border accent. Rust = industrial/elevated, sage = nominal. */
  accent?: 'rust' | 'sage' | 'neutral' | 'warn';
  decimals?: number;
  /** Percentage change against the previous window; null when unknowable. */
  delta?: number | null;
  footnote?: ReactNode;
  className?: string;
}) {
  const numberRef = useCountUp(value, { decimals });

  const accentColor = {
    rust: 'border-l-rust',
    sage: 'border-l-sage',
    warn: 'border-l-risk-high',
    neutral: 'border-l-line-strong',
  }[accent];

  return (
    <div
      className={cn(
        'tims-enter tims-accent-l border border-line bg-surface px-3 py-2.5',
        accentColor,
        className,
      )}
    >
      <p className="tims-label">{label}</p>

      <p className="mt-1.5 flex items-baseline gap-1">
        {/* suppressHydrationWarning: GSAP writes textContent on the client, so
            the server-rendered "0" intentionally differs from first paint. */}
        <span
          ref={numberRef}
          suppressHydrationWarning
          className="tims-data text-[26px] font-medium leading-none text-fg"
        >
          0
        </span>
        {unit ? <span className="tims-data text-[11px] text-fg-subtle">{unit}</span> : null}
      </p>

      <div className="mt-1.5 flex min-h-[14px] items-center gap-2">
        {delta !== undefined && delta !== null ? (
          <span
            className={cn(
              'tims-data text-[10px]',
              delta > 0 ? 'text-rust' : delta < 0 ? 'text-sage' : 'text-fg-subtle',
            )}
            title="Change against the preceding window of equal length"
          >
            {delta > 0 ? '▲' : delta < 0 ? '▼' : '—'} {Math.abs(delta).toFixed(1)}%
          </span>
        ) : null}
        {footnote ? <span className="text-[10px] leading-tight text-fg-subtle">{footnote}</span> : null}
      </div>
    </div>
  );
}

/** Row of stat cards divided by hairlines rather than gaps. */
export function StatRow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-4', className)}>
      {children}
    </div>
  );
}
