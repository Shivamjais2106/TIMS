import { ArrowDownRight, ArrowRight, ArrowUpRight, type LucideIcon } from 'lucide-react';
import { formatNumber, formatSignedPercent } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { StatDelta } from '@/types';

interface StatCardProps {
  label: string;
  value: number;
  icon: LucideIcon;
  /** Accent colour for the icon chip — normally the risk or event-type colour. */
  accent: string;
  delta?: StatDelta;
  /** Sub-label under the value, e.g. "last 30 days". */
  caption?: string;
  /**
   * When true, a rise is bad (more fires) rather than good. Controls whether an
   * increase is tinted red or green.
   */
  higherIsWorse?: boolean;
}

export function StatCard({
  label,
  value,
  icon: Icon,
  accent,
  delta,
  caption,
  higherIsWorse = true,
}: StatCardProps) {
  const change = delta?.changePercent ?? null;
  const rising = change !== null && change > 0;
  const falling = change !== null && change < 0;
  const bad = higherIsWorse ? rising : falling;
  const good = higherIsWorse ? falling : rising;

  const TrendIcon = rising ? ArrowUpRight : falling ? ArrowDownRight : ArrowRight;

  return (
    <article className="group relative overflow-hidden rounded-xl border border-line bg-surface p-5">
      {/* Thin accent rule tying the tile to its metric colour. */}
      <span
        className="absolute inset-x-0 top-0 h-px opacity-70"
        style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }}
        aria-hidden
      />

      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-fg-muted">{label}</p>
        <span
          className="grid size-8 shrink-0 place-items-center rounded-lg"
          style={{ backgroundColor: `${accent}1f`, color: accent }}
          aria-hidden
        >
          <Icon className="size-4" />
        </span>
      </div>

      <p className="tims-data mt-3 text-3xl font-semibold leading-none text-fg">{formatNumber(value)}</p>

      <div className="mt-3 flex items-center gap-2 text-xs">
        {change !== null ? (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 font-medium',
              bad ? 'text-red-500' : good ? 'text-emerald-500' : 'text-fg-subtle',
            )}
          >
            <TrendIcon className="size-3.5" aria-hidden />
            {formatSignedPercent(change)}
          </span>
        ) : (
          <span className="text-fg-subtle">No prior data</span>
        )}
        {caption ? <span className="text-fg-subtle">{caption}</span> : null}
      </div>
    </article>
  );
}
