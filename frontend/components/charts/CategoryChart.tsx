'use client';

import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { EVENT_TYPE_META } from '@/lib/constants';
import { formatNumber } from '@/lib/format';
import type { CategoryBreakdown } from '@/types';
import { AXIS_PROPS, ChartFrame, TOOLTIP_LABEL_STYLE, TOOLTIP_STYLE } from './ChartShell';

interface CategoryChartProps {
  data: CategoryBreakdown['byEventType'];
  height?: number;
}

/**
 * Detections by event type.
 *
 * Horizontal bars because the category labels are long and ranked comparison is
 * the point — a vertical bar chart would need rotated labels for no gain.
 */
export function CategoryChart({ data, height = 260 }: CategoryChartProps) {
  const rows = [...data]
    .sort((a, b) => b.count - a.count)
    .map((row) => ({ ...row, label: EVENT_TYPE_META[row.eventType].label }));

  return (
    <ChartFrame height={height}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 8 }} barSize={16}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="label" width={118} {...AXIS_PROPS} />
          <Tooltip
            cursor={{ fill: 'var(--tims-surface-3)', opacity: 0.5 }}
            contentStyle={TOOLTIP_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
            formatter={(value, _name, item) => {
              const payload = (item as { payload: (typeof rows)[number] }).payload;
              return [
                `${formatNumber(Number(value))} events · ${payload.share.toFixed(1)}% · avg risk ${payload.avgRiskScore}`,
                'Detections',
              ];
            }}
          />
          <Bar dataKey="count" radius={[0, 4, 4, 0]} isAnimationActive={false}>
            {rows.map((row) => (
              <Cell key={row.eventType} fill={EVENT_TYPE_META[row.eventType].color} />
            ))}
            <LabelList
              dataKey="count"
              position="right"
              formatter={(value) => formatNumber(Number(value))}
              style={{ fill: 'var(--tims-fg-muted)', fontSize: 11 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
