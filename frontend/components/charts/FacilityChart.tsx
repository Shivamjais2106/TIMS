'use client';

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { FACILITY_TYPE_META } from '@/lib/constants';
import { formatNumber } from '@/lib/format';
import type { CategoryBreakdown, FacilityType } from '@/types';
import { AXIS_PROPS, ChartFrame, CHART_COLORS, TOOLTIP_LABEL_STYLE, TOOLTIP_STYLE } from './ChartShell';

/** Thermal load per facility class — which kind of plant is generating heat. */
export function FacilityChart({
  data,
  height = 260,
}: {
  data: CategoryBreakdown['byFacilityType'];
  height?: number;
}) {
  const rows = data.map((row) => ({
    ...row,
    label: FACILITY_TYPE_META[row.facilityType as FacilityType]?.label ?? row.facilityType,
    color: FACILITY_TYPE_META[row.facilityType as FacilityType]?.color ?? '#64748b',
  }));

  return (
    <ChartFrame height={height}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 40, left: -18 }} barSize={26}>
          <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" interval={0} angle={-34} textAnchor="end" height={56} {...AXIS_PROPS} />
          <YAxis allowDecimals={false} width={44} {...AXIS_PROPS} />
          <Tooltip
            cursor={{ fill: 'var(--tims-surface-3)', opacity: 0.5 }}
            contentStyle={TOOLTIP_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
            formatter={(value, _name, item) => {
              const payload = (item as { payload: (typeof rows)[number] }).payload;
              return [`${formatNumber(Number(value))} detections across ${payload.count} site(s)`, 'Thermal load'];
            }}
          />
          <Bar dataKey="hotspotCount" radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {rows.map((row) => (
              <Cell key={row.facilityType} fill={row.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
