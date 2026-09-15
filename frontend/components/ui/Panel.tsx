import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * A bordered section.
 *
 * Panels are the only container in the design: a 1px hairline border, flat
 * surface, square corners, no shadow. Depth is expressed by the border and by
 * the surface step, not by elevation.
 */
export function Panel({
  children,
  className,
  as: Component = 'section',
}: {
  children: ReactNode;
  className?: string;
  as?: 'section' | 'div' | 'article' | 'aside';
}) {
  return (
    <Component className={cn('border border-line bg-surface', className)}>{children}</Component>
  );
}

/**
 * Panel header: a mono channel label on the left, optional controls right,
 * separated from the body by a hairline.
 */
export function PanelHeader({
  label,
  title,
  meta,
  actions,
  className,
}: {
  /** Small uppercase mono channel label, e.g. "DETECTION REGISTER". */
  label?: string;
  title?: ReactNode;
  /** Right-aligned mono readout, e.g. a record count. */
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        'flex min-h-[38px] items-center justify-between gap-3 border-b border-line px-3 py-2',
        className,
      )}
    >
      <div className="min-w-0">
        {label ? <p className="tims-label">{label}</p> : null}
        {title ? (
          <h2 className="truncate text-[13px] font-medium leading-tight text-fg">{title}</h2>
        ) : null}
      </div>

      <div className="flex flex-none items-center gap-2">
        {meta ? <span className="tims-data text-[11px] text-fg-subtle">{meta}</span> : null}
        {actions}
      </div>
    </header>
  );
}

export function PanelBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('p-3', className)}>{children}</div>;
}

/**
 * Key/value readout row, as used on an instrument panel: label left in muted
 * sans, value right in mono. Rows are separated by hairlines by the parent.
 */
export function Readout({
  label,
  value,
  mono = true,
  className,
  title,
}: {
  label: string;
  value: ReactNode;
  /** Set false for prose values, which should not be tabular mono. */
  mono?: boolean;
  className?: string;
  title?: string;
}) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3 py-1.5', className)} title={title}>
      <span className="flex-none text-[11px] text-fg-muted">{label}</span>
      <span
        className={cn(
          'min-w-0 truncate text-right text-[12px] text-fg',
          mono && 'tims-data',
        )}
      >
        {value}
      </span>
    </div>
  );
}

/** Vertical list of Readouts with hairline separators. */
export function ReadoutList({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('divide-y divide-line', className)}>{children}</div>;
}
