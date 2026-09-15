'use client';

import { useBarGrow } from '@/hooks/useGsap';
import { cn } from '@/lib/utils';

/**
 * Horizontal bar list.
 *
 * This is the project's replacement for pie and donut charts. A ranked list of
 * labelled bars is strictly easier to read than a circle: values are directly
 * comparable along a shared baseline, the labels sit next to their bars instead
 * of in a detached legend, and it stays legible at any panel width.
 */

export interface BarItem {
  label: string;
  value: number;
  color: string;
  /** Optional secondary figure shown right of the value, e.g. a share. */
  note?: string;
  title?: string;
}

export function BarList({
  items,
  total,
  unit,
  className,
  maxRows,
  emptyMessage = 'No data',
}: {
  items: BarItem[];
  /** Denominator for the bar widths. Defaults to the largest value. */
  total?: number;
  unit?: string;
  className?: string;
  maxRows?: number;
  emptyMessage?: string;
}) {
  if (items.length === 0) {
    return <p className={cn('px-1 py-6 text-center text-[11px] text-fg-subtle', className)}>{emptyMessage}</p>;
  }

  const rows = maxRows ? items.slice(0, maxRows) : items;
  // Scaling to the maximum rather than the sum: the question a ranked list
  // answers is "how do these compare to each other", not "what fraction of a
  // whole is each" — that is what the stacked bar below is for.
  const denominator = total ?? Math.max(...items.map((item) => item.value), 1);

  return (
    <ul className={cn('space-y-1.5', className)}>
      {rows.map((item, index) => (
        <Bar
          // Position-keyed: this is a shared component and the label comes
          // from the caller, so two callers could legitimately pass the same
          // label. The list is ordered and display-only, so the index is stable.
          key={`${index}-${item.label}`}
          item={item}
          percent={denominator > 0 ? (item.value / denominator) * 100 : 0}
          delay={index * 0.04}
          unit={unit}
        />
      ))}
    </ul>
  );
}

function Bar({
  item,
  percent,
  delay,
  unit,
}: {
  item: BarItem;
  percent: number;
  delay: number;
  unit?: string;
}) {
  const barRef = useBarGrow(percent, delay);

  return (
    <li title={item.title}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[11px] text-fg-muted">{item.label}</span>
        <span className="tims-data flex-none text-[11px] text-fg">
          {item.value.toLocaleString('en-IN')}
          {unit ? <span className="ml-0.5 text-fg-subtle">{unit}</span> : null}
          {item.note ? <span className="ml-1.5 text-[10px] text-fg-subtle">{item.note}</span> : null}
        </span>
      </div>
      <div className="mt-1 h-[5px] w-full bg-surface-2">
        <div ref={barRef} className="h-full" style={{ width: 0, background: item.color }} />
      </div>
    </li>
  );
}

/**
 * Single stacked bar showing composition of a whole.
 *
 * Used where a pie chart would traditionally appear — risk distribution, for
 * example. A 100% stacked bar communicates the same proportions without
 * requiring the reader to compare angles.
 */
export function StackedBar({
  segments,
  className,
  showLegend = true,
}: {
  segments: Array<{ label: string; value: number; color: string }>;
  className?: string;
  showLegend?: boolean;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);

  if (total === 0) {
    return <p className={cn('py-4 text-center text-[11px] text-fg-subtle', className)}>No data</p>;
  }

  return (
    <div className={className}>
      <div className="flex h-5 w-full overflow-hidden border border-line" role="img" aria-label="Composition">
        {segments
          .filter((segment) => segment.value > 0)
          .map((segment, index) => (
            <div
              key={`${index}-${segment.label}`}
              style={{ width: `${(segment.value / total) * 100}%`, background: segment.color }}
              title={`${segment.label}: ${segment.value} (${((segment.value / total) * 100).toFixed(1)}%)`}
            />
          ))}
      </div>

      {showLegend ? (
        <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
          {segments.map((segment, index) => (
            <li key={`${index}-${segment.label}`} className="flex items-center gap-1.5">
              <span
                className="size-[7px] flex-none"
                style={{ background: segment.color }}
                aria-hidden
              />
              <span className="flex-1 truncate text-[10px] text-fg-muted">{segment.label}</span>
              <span className="tims-data flex-none text-[10px] text-fg">{segment.value}</span>
              <span className="tims-data flex-none text-[10px] text-fg-subtle">
                {((segment.value / total) * 100).toFixed(0)}%
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
