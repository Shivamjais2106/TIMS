'use client';

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { usePalette, PALETTE_DARK } from '@/hooks/useTheme';
import { formatAxisDate, formatDate } from '@/lib/format';
import type { TrendPoint } from '@/types';

/**
 * Detection trend over time.
 *
 * Total detections as a filled area (the volume), industrial detections and
 * high-risk detections as thin lines over it (the signal within the volume).
 * Two accents only, plus grayscale.
 */

interface TooltipPayloadEntry {
  name?: string;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="border border-line-strong bg-surface px-2 py-1.5">
      <p className="tims-data text-[10px] text-fg-subtle">{formatDate(String(label))}</p>
      <ul className="mt-1 space-y-0.5">
        {payload.map((entry) => (
          <li key={String(entry.dataKey)} className="flex items-center gap-2">
            <span
              className="size-[6px] flex-none"
              style={{ background: entry.color }}
              aria-hidden
            />
            <span className="flex-1 text-[10px] text-fg-muted">{entry.name}</span>
            <span className="tims-data text-[11px] text-fg">{entry.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TrendChart({
  data,
  height = 200,
  showIndustrial = true,
  showHighRisk = true,
}: {
  data: TrendPoint[];
  height?: number;
  showIndustrial?: boolean;
  showHighRisk?: boolean;
}) {
  // Recharts writes SVG presentation attributes, which do not resolve CSS
  // custom properties, so the series colours have to be real values.
  const PALETTE = usePalette();

  // Unique per render of the palette: an SVG gradient is referenced by id, and
  // reusing one id across themes leaves the old stop colours in place.
  const gradientId = `tims-area-${PALETTE.bg.replace('#', '')}`;

  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-[11px] text-fg-subtle"
        style={{ height }}
      >
        No detections in this window
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: -18 }}>
        <defs>
          {/* The one gradient in the project, and it is a fill opacity ramp on
              a chart area rather than a decorative background — the design
              rule is about surfaces, not data encoding. */}
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={PALETTE.fgMuted} stopOpacity={0.22} />
            <stop offset="100%" stopColor={PALETTE.fgMuted} stopOpacity={0.02} />
          </linearGradient>
        </defs>

        <CartesianGrid stroke={PALETTE.line} vertical={false} />

        <XAxis
          dataKey="date"
          tickFormatter={formatAxisDate}
          tick={{ fontSize: 10, fill: PALETTE.fgSubtle }}
          axisLine={{ stroke: PALETTE.line }}
          tickLine={false}
          minTickGap={24}
        />
        <YAxis
          tick={{ fontSize: 10, fill: PALETTE.fgSubtle }}
          axisLine={false}
          tickLine={false}
          width={38}
          allowDecimals={false}
        />

        <Tooltip content={<ChartTooltip />} cursor={{ stroke: PALETTE.lineStrong, strokeWidth: 1 }} />

        <Area
          type="monotone"
          dataKey="total"
          name="All detections"
          stroke={PALETTE.fgMuted}
          strokeWidth={1}
          fill={`url(#${gradientId})`}
          dot={false}
          activeDot={{ r: 2.5, fill: PALETTE.fg, stroke: 'none' }}
        />

        {showIndustrial ? (
          <Line
            type="monotone"
            dataKey="industrial"
            name="Industrial"
            stroke={PALETTE.rust}
            strokeWidth={1.4}
            dot={false}
            activeDot={{ r: 2.5, fill: PALETTE.rust, stroke: 'none' }}
          />
        ) : null}

        {showHighRisk ? (
          <Line
            type="monotone"
            dataKey="highRisk"
            name="High risk"
            stroke={PALETTE.sage}
            strokeWidth={1.4}
            strokeDasharray="3 2"
            dot={false}
            activeDot={{ r: 2.5, fill: PALETTE.sage, stroke: 'none' }}
          />
        ) : null}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Compact inline sparkline for a stat card or table cell. */
export function Sparkline({
  values,
  color = PALETTE_DARK.fgMuted,
  height = 26,
}: {
  values: number[];
  color?: string;
  height?: number;
}) {
  if (values.length < 2) return null;

  const data = values.map((value, index) => ({ index, value }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
        <Line type="monotone" dataKey="value" stroke={color} strokeWidth={1} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
