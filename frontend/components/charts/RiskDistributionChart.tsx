'use client';

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { RISK_META } from '@/lib/constants';
import { formatNumber } from '@/lib/format';
import type { RiskLevel } from '@/types';
import { ChartFrame, TOOLTIP_LABEL_STYLE, TOOLTIP_STYLE } from './ChartShell';

interface RiskDistributionChartProps {
  data: Array<{ riskLevel: RiskLevel; count: number }>;
  height?: number;
}

/**
 * Risk mix as a donut.
 *
 * A donut is normally a poor choice, but there are exactly four ordered
 * categories here and the question being asked is "what share is critical?" —
 * a part-to-whole question. The total sits in the hole so the chart answers
 * both "how many" and "what proportion" at once.
 */
export function RiskDistributionChart({ data, height = 240 }: RiskDistributionChartProps) {
  const total = data.reduce((sum, entry) => sum + entry.count, 0);

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="relative shrink-0" style={{ width: height, height }}>
        <ChartFrame height={height}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="count"
                nameKey="riskLevel"
                cx="50%"
                cy="50%"
                innerRadius="62%"
                outerRadius="88%"
                paddingAngle={2}
                strokeWidth={0}
                isAnimationActive={false}
              >
                {data.map((entry) => (
                  <Cell key={entry.riskLevel} fill={RISK_META[entry.riskLevel].color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelStyle={TOOLTIP_LABEL_STYLE}
                formatter={(value, name) => {
                  const count = Number(value);
                  const share = total ? ((count / total) * 100).toFixed(1) : '0.0';
                  return [`${formatNumber(count)} (${share}%)`, RISK_META[name as RiskLevel]?.label ?? String(name)];
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </ChartFrame>

        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="text-center">
            <p className="tims-data text-2xl font-semibold leading-none text-fg">{formatNumber(total)}</p>
            <p className="mt-1 text-[10px] uppercase tracking-wide text-fg-subtle">Events</p>
          </div>
        </div>
      </div>

      <ul className="w-full space-y-2">
        {data.map((entry) => {
          const share = total === 0 ? 0 : (entry.count / total) * 100;
          const meta = RISK_META[entry.riskLevel];
          return (
            <li key={entry.riskLevel} className="flex items-center gap-3">
              <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: meta.color }} aria-hidden />
              <span className="w-16 shrink-0 text-xs text-fg">{meta.label}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
                <div className="h-full rounded-full" style={{ width: `${share}%`, backgroundColor: meta.color }} />
              </div>
              <span className="tims-data w-14 shrink-0 text-right text-xs text-fg-muted">
                {formatNumber(entry.count)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
