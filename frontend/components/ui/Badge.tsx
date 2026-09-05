import type { ReactNode } from 'react';
import { RISK_META } from '@/lib/constants';
import { cn } from '@/lib/utils';
import type { RiskLevel, Severity } from '@/types';

interface BadgeProps {
  children: ReactNode;
  className?: string;
  /** Small square swatch rendered before the label. */
  dotColor?: string;
}

export function Badge({ children, className, dotColor }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-medium',
        'bg-surface-3 text-fg-muted ring-1 ring-inset ring-line',
        className,
      )}
    >
      {dotColor ? (
        <span className="size-1.5 rounded-full" style={{ backgroundColor: dotColor }} aria-hidden />
      ) : null}
      {children}
    </span>
  );
}

/**
 * Risk chip. Colour is load-bearing here, so the level is always spelled out in
 * text as well — a colour-blind reviewer must be able to read severity.
 */
export function RiskBadge({ level, className }: { level: RiskLevel | Severity; className?: string }) {
  const meta = RISK_META[level];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
        meta.badgeClass,
        className,
      )}
    >
      <span className={cn('size-1.5 rounded-full', meta.dotClass)} aria-hidden />
      {meta.label}
    </span>
  );
}
