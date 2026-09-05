'use client';

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { RISK_META } from '@/lib/constants';
import { formatNumber } from '@/lib/format';
import type { CategoryBreakdown } from '@/types';
import { AXIS_PROPS, ChartFrame, CHART_COLORS, TOOLTIP_LABEL_STYLE, TOOLTIP_STYLE } from './ChartShell';

/**
 * Detections per region, with the high-risk share stacked on top.
 *
 * Stacking is appropriate here: high-risk events are a strict subset of the
 * total, so the two segments genuinely sum to the bar.
 */
export function RegionChart({ data, height = 280 }: { data: CategoryBreakdown['byRegion']; height?: number }) {
  const rows = data.map((row) => ({
    region: row.region,
    other: Math.max(0, row.count - row.highRisk),
    highRisk: row.highRisk,
  }));

  return (
    <ChartFrame height={height}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 44, left: -18 }} barSize={22}>
          <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="region"
            interval={0}
            angle={-38}
            textAnchor="end"
            height={60}
            {...AXIS_PROPS}
          />
          <YAxis allowDecimals={false} width={44} {...AXIS_PROPS} />
          <Tooltip
            cursor={{ fill: 'var(--tims-surface-3)', opacity: 0.5 }}
            contentStyle={TOOLTIP_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
            formatter={(value, name) => [formatNumber(Number(value)), String(name)]}
          />
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4, color: 'var(--tims-fg-muted)' }} />
          <Bar dataKey="other" name="Low / medium" stackId="region" fill={RISK_META.LOW.color} radius={[0, 0, 0, 0]} />
          <Bar
            dataKey="highRisk"
            name="High / critical"
            stackId="region"
            fill={RISK_META.CRITICAL.color}
            radius={[3, 3, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
