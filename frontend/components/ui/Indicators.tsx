'use client';

import type { ReactNode } from 'react';
import {
  classColor,
  CLASSIFICATION_PATH_META,
  riskColor,
  RISK_META,
  THERMAL_CLASS_META,
} from '@/lib/constants';
import { useTheme } from '@/hooks/useTheme';
import { formatPercent } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { AlertStatus, ClassificationPath, RiskLevel, ThermalClass } from '@/types';

/**
 * Status indicators.
 *
 * All rectangular with a hairline border and mono type — no rounded pill
 * badges. Colour always comes from the shared tables in lib/constants so a
 * badge, a map marker and a chart series cannot disagree.
 */

/** Rectangular status chip. The base form for every indicator here. */
export function Status({
  children,
  color,
  className,
  title,
}: {
  children: ReactNode;
  /** Raw hex; applied to both text and border via currentColor. */
  color: string;
  className?: string;
  title?: string;
}) {
  return (
    <span className={cn('tims-status', className)} style={{ color }} title={title}>
      {children}
    </span>
  );
}

/** Risk level, with its operational gloss in the tooltip. */
export function RiskBadge({
  level,
  score,
  className,
}: {
  level: RiskLevel;
  /** Shown alongside the label when supplied. */
  score?: number;
  className?: string;
}) {
  const { theme } = useTheme();
  const meta = RISK_META[level];
  const color = riskColor(level, theme);
  return (
    <Status
      color={color}
      className={className}
      title={`${meta.label} risk (${meta.minScore}+) — ${meta.note}. ${
        score !== undefined ? `Score ${score}/100.` : ''
      }`}
    >
      <span className="tims-led" style={{ background: color }} aria-hidden />
      {meta.label}
      {score !== undefined ? <span className="tims-data opacity-70">{score.toFixed(0)}</span> : null}
    </Status>
  );
}

/**
 * A risk score rendered as a small horizontal meter.
 *
 * A bar rather than a ring or donut: the brief rules out circular charts, and
 * a bar also reads correctly at 16px in a table row.
 */
export function RiskMeter({
  score,
  level,
  className,
  showValue = true,
}: {
  score: number;
  level: RiskLevel;
  className?: string;
  showValue?: boolean;
}) {
  const { theme } = useTheme();
  const meta = RISK_META[level];
  const color = riskColor(level, theme);
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        className="relative h-[6px] w-full min-w-[48px] border border-line bg-surface-2"
        role="meter"
        aria-valuenow={score}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Risk score ${score} of 100, ${meta.label}`}
      >
        <div
          className="absolute inset-y-0 left-0"
          style={{ width: `${Math.max(0, Math.min(100, score))}%`, background: color }}
        />
      </div>
      {showValue ? (
        <span className="tims-data flex-none text-[11px] text-fg-muted">{score.toFixed(0)}</span>
      ) : null}
    </div>
  );
}

/** Hedged thermal class, with the full description in the tooltip. */
export function ClassBadge({
  thermalClass,
  compact = false,
  className,
}: {
  thermalClass: ThermalClass | null;
  compact?: boolean;
  className?: string;
}) {
  const { theme } = useTheme();

  if (!thermalClass) {
    return (
      <Status
        color={theme === 'light' ? '#8a8f93' : '#575d63'}
        className={className}
        title="No classification applied yet"
      >
        Unclassified
      </Status>
    );
  }

  const meta = THERMAL_CLASS_META[thermalClass];
  return (
    <Status color={classColor(thermalClass, theme)} className={className} title={meta.description}>
      {compact ? meta.short : meta.label}
    </Status>
  );
}

/**
 * Where a classification came from.
 *
 * Shown next to every class so an analyst can always tell a model prediction
 * from a degraded-mode rule guess. Confidence is only rendered for the model
 * path, because the rule engine has none.
 */
export function ProvenanceBadge({
  path,
  confidence,
  modelVersion,
  className,
}: {
  path: ClassificationPath;
  confidence?: number | null;
  modelVersion?: string | null;
  className?: string;
}) {
  const meta = CLASSIFICATION_PATH_META[path];
  const title = modelVersion ? `${meta.note} Model ${modelVersion}.` : meta.note;

  return (
    <Status color={meta.color} className={className} title={title}>
      {meta.short}
      {path === 'ML_SERVICE' && confidence != null ? (
        <span className="tims-data opacity-75">{formatPercent(confidence * 100, 0)}</span>
      ) : null}
    </Status>
  );
}

const ALERT_STATUS_META: Record<
  AlertStatus,
  { label: string; color: string; colorLight: string; note: string }
> = {
  OPEN: {
    label: 'Open',
    color: '#c1502e',
    colorLight: '#a8401f',
    note: 'Not yet triaged by an analyst.',
  },
  ACKNOWLEDGED: {
    label: 'Acknowledged',
    color: '#b57340',
    colorLight: '#9c5720',
    note: 'An analyst has taken ownership of this alert.',
  },
  RESOLVED: {
    label: 'Resolved',
    color: '#6b9e7a',
    colorLight: '#46745a',
    note: 'Handled and closed out.',
  },
  DISMISSED: {
    label: 'Dismissed',
    color: '#575d63',
    colorLight: '#8a8f93',
    note: 'Judged not actionable.',
  },
};

export function AlertStatusBadge({ status, className }: { status: AlertStatus; className?: string }) {
  const { theme } = useTheme();
  const meta = ALERT_STATUS_META[status];
  return (
    <Status
      color={theme === 'light' ? meta.colorLight : meta.color}
      className={className}
      title={meta.note}
    >
      {meta.label}
    </Status>
  );
}

/**
 * Live connection indicator for the header.
 *
 * Sage when the websocket is up, rust when it is not. The state is real — it
 * reflects the actual Socket.io connection rather than being decorative.
 */
export function LiveIndicator({ connected, className }: { connected: boolean; className?: string }) {
  const { palette } = useTheme();
  const color = connected ? palette.sage : palette.rust;

  return (
    <span
      className={cn('flex items-center gap-1.5', className)}
      title={
        connected
          ? 'Connected to the alert stream. New alerts appear without refreshing.'
          : 'Alert stream disconnected. Reconnecting automatically; the page will not update live until it succeeds.'
      }
    >
      <span className="relative flex">
        <span className="tims-led" style={{ background: color }} aria-hidden />
        {connected ? (
          <span
            className="tims-pill absolute -inset-[3px] animate-ping border border-sage opacity-40"
            aria-hidden
          />
        ) : null}
      </span>
      <span className="tims-label" style={{ color }}>
        {connected ? 'Live' : 'Offline'}
      </span>
    </span>
  );
}

/**
 * Standing caveat line.
 *
 * Used wherever the UI must not overclaim: risk scores, classifications,
 * population, distances.
 */
export function Caveat({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn('border-l-2 border-l-line-strong pl-2 text-[10px] leading-snug text-fg-subtle', className)}>
      {children}
    </p>
  );
}

/** Persistence, expressed as the number of distinct days seen. */
export function PersistenceBadge({ days, className }: { days: number; className?: string }) {
  const { palette, theme } = useTheme();
  const isPersistent = days >= 3;
  return (
    <Status
      color={isPersistent ? (theme === 'light' ? '#9c5720' : '#b57340') : palette.fgMuted}
      className={className}
      title={
        isPersistent
          ? `Detected on ${days} separate days within the lookback window. Persistence suggests a fixed source, but does not by itself mean the source is industrial.`
          : days > 1
            ? `Detected on ${days} days.`
            : 'Seen on a single satellite pass.'
      }
    >
      {days}d
    </Status>
  );
}
