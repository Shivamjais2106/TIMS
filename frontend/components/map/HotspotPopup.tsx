'use client';

import { ArrowUpRight, Factory } from 'lucide-react';
import Link from 'next/link';
import { EVENT_TYPE_META, RISK_META, SOURCE_LABELS } from '@/lib/constants';
import {
  formatCoordinate,
  formatDateTime,
  formatDistance,
  formatDuration,
  formatPower,
  formatTemperature,
  formatTemperatureCelsius,
  shortId,
} from '@/lib/format';
import type { Hotspot } from '@/types';
import { RiskIndicator } from '../ui/RiskIndicator';

function Row({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <dt className="shrink-0 text-[11px] text-fg-subtle">{label}</dt>
      <dd className={`truncate text-[11px] font-medium text-fg ${mono ? 'tims-data' : ''}`}>{value}</dd>
    </div>
  );
}

/**
 * Detail card for a single thermal detection.
 *
 * Used both inside the Leaflet popup (via a React portal) and in the hotspots
 * page side panel, so the two can never drift apart.
 */
export function HotspotPopup({ hotspot }: { hotspot: Hotspot }) {
  const event = EVENT_TYPE_META[hotspot.eventType];
  const risk = RISK_META[hotspot.riskLevel];

  return (
    <article className="w-[286px] overflow-hidden rounded-[9px] bg-surface text-fg">
      <header className="border-b border-line px-3.5 py-2.5" style={{ borderTopColor: event.color }}>
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide">
            <span className="size-2 rounded-full" style={{ backgroundColor: event.color }} aria-hidden />
            {event.label}
          </span>
          <span
            className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
            style={{ backgroundColor: `${risk.color}22`, color: risk.color }}
          >
            {risk.label}
          </span>
        </div>
        <p className="tims-data mt-1 text-[10px] text-fg-subtle">ID {shortId(hotspot.id, 10, 6)}</p>
      </header>

      <div className="px-3.5 py-2.5">
        <div className="mb-2 flex items-center gap-2">
          <RiskIndicator score={hotspot.riskScore} level={hotspot.riskLevel} className="flex-1" />
        </div>

        <dl className="divide-y divide-line/60">
          <Row label="Latitude" value={formatCoordinate(hotspot.latitude, 'lat')} />
          <Row label="Longitude" value={formatCoordinate(hotspot.longitude, 'lng')} />
          <Row label="Confidence" value={`${hotspot.confidence}%`} />
          <Row
            label="Brightness"
            value={`${formatTemperature(hotspot.brightnessTemperature)} · ${formatTemperatureCelsius(hotspot.brightnessTemperature)}`}
          />
          <Row label="Radiative power" value={formatPower(hotspot.frp)} />
          <Row label="Detected" value={formatDateTime(hotspot.detectedAt)} />
          <Row
            label="Persistence"
            value={`${formatDuration(hotspot.persistenceDays)} (${hotspot.persistenceDays}d)`}
          />
          <Row label="Source" value={SOURCE_LABELS[hotspot.source] ?? hotspot.source} mono={false} />
        </dl>
      </div>

      <footer className="border-t border-line bg-surface-2 px-3.5 py-2.5">
        {hotspot.industrialFacility ? (
          <div className="flex items-start gap-2">
            <Factory className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-medium text-fg">{hotspot.industrialFacility.name}</p>
              <p className="truncate text-[10px] text-fg-subtle">
                {hotspot.industrialFacility.location}
                {hotspot.distanceToFacilityM != null
                  ? ` · ${formatDistance(hotspot.distanceToFacilityM)} away`
                  : ''}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-fg-subtle">No industrial facility within 50 km</p>
        )}

        <Link
          href={`/dashboard/hotspots?focus=${hotspot.id}`}
          className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
        >
          Open in hotspot register
          <ArrowUpRight className="size-3" aria-hidden />
        </Link>
      </footer>
    </article>
  );
}
