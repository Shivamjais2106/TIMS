import { RISK_META } from '@/lib/constants';
import { cn } from '@/lib/utils';
import type { RiskLevel } from '@/types';

interface RiskIndicatorProps {
  score: number;
  level: RiskLevel;
  /** Hides the numeric score, leaving just the bar — used inside dense tables. */
  compact?: boolean;
  className?: string;
}

/**
 * Horizontal 0-100 risk meter.
 *
 * The bar is a redundant encoding of the same value shown numerically, which
 * makes scanning a long table fast without relying on colour alone.
 */
export function RiskIndicator({ score, level, compact = false, className }: RiskIndicatorProps) {
  const meta = RISK_META[level];
  const width = Math.max(2, Math.min(100, score));

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        className="h-1.5 w-full min-w-[40px] max-w-[120px] overflow-hidden rounded-full bg-surface-3"
        role="meter"
        aria-valuenow={Math.round(score)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Risk score ${Math.round(score)} of 100, ${meta.label}`}
      >
        <div className="h-full rounded-full" style={{ width: `${width}%`, backgroundColor: meta.color }} />
      </div>
      {compact ? null : (
        <span className="tims-data w-9 shrink-0 text-right text-xs font-medium text-fg-muted">
          {score.toFixed(0)}
        </span>
      )}
    </div>
  );
}
