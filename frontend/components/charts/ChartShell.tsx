'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Shared axis / grid / tooltip styling so every chart reads as one system. */
export const CHART_COLORS = {
  grid: 'var(--tims-border)',
  axis: 'var(--tims-fg-subtle)',
  tooltipBg: 'var(--tims-surface)',
  tooltipBorder: 'var(--tims-border-strong)',
};

export const AXIS_PROPS = {
  stroke: 'var(--tims-fg-subtle)',
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const;

export const TOOLTIP_STYLE = {
  backgroundColor: 'var(--tims-surface)',
  border: '1px solid var(--tims-border-strong)',
  borderRadius: 8,
  fontSize: 12,
  padding: '8px 10px',
  boxShadow: '0 12px 28px -12px rgb(0 0 0 / 0.45)',
} as const;

export const TOOLTIP_LABEL_STYLE = {
  color: 'var(--tims-fg-muted)',
  fontSize: 11,
  marginBottom: 4,
} as const;

export function ChartFrame({ children, height = 260, className }: { children: ReactNode; height?: number; className?: string }) {
  return (
    <div className={cn('w-full', className)} style={{ height }}>
      {children}
    </div>
  );
}
