'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { EVENT_TYPE_META } from '@/lib/constants';
import { formatAxisDate } from '@/lib/format';
import type { TrendPoint } from '@/types';
import { AXIS_PROPS, ChartFrame, CHART_COLORS, TOOLTIP_LABEL_STYLE, TOOLTIP_STYLE } from './ChartShell';

/**
 * Detections over time.
 *
 * Total is an area (the volume story) with industrial and high-risk drawn as
 * lines on top, because those two are the series an operator actually tracks
 * and stacking them would hide their true magnitude.
 */
export function TrendChart({ data, height = 280 }: { data: TrendPoint[]; height?: number }) {
  return (
    <ChartFrame height={height}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <defs>
            <linearGradient id="tims-trend-total" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--tims-primary)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--tims-primary)" stopOpacity={0} />
            </linearGradient>
          </defs>

          <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="date" tickFormatter={formatAxisDate} minTickGap={28} {...AXIS_PROPS} />
          <YAxis allowDecimals={false} width={44} {...AXIS_PROPS} />

          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
            labelFormatter={(label) => formatAxisDate(String(label))}
            cursor={{ stroke: 'var(--tims-border-strong)', strokeWidth: 1 }}
          />
          <Legend
            iconType="plainline"
            wrapperStyle={{ fontSize: 11, paddingTop: 8, color: 'var(--tims-fg-muted)' }}
          />

          <Area
            type="monotone"
            dataKey="total"
            name="All detections"
            stroke="var(--tims-primary)"
            strokeWidth={1.5}
            fill="url(#tims-trend-total)"
            dot={false}
            activeDot={{ r: 3 }}
          />
          <Line
            type="monotone"
            dataKey="industrial"
            name="Industrial"
            stroke={EVENT_TYPE_META.GAS_FLARE.color}
            strokeWidth={1.75}
            dot={false}
            activeDot={{ r: 3 }}
          />
          <Line
            type="monotone"
            dataKey="highRisk"
            name="High / critical risk"
            stroke={EVENT_TYPE_META.INDUSTRIAL_FIRE.color}
            strokeWidth={1.75}
            strokeDasharray="4 3"
            dot={false}
            activeDot={{ r: 3 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
