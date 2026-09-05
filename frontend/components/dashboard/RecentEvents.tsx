'use client';

import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { EVENT_TYPE_META } from '@/lib/constants';
import { formatCoordinatePair, formatRelativeTime, formatTemperature } from '@/lib/format';
import type { Hotspot } from '@/types';
import { EmptyState } from '../ui/EmptyState';
import { RiskIndicator } from '../ui/RiskIndicator';

/** Latest detections, newest first. Compact enough to sit beside the map. */
export function RecentEvents({ hotspots }: { hotspots: Hotspot[] }) {
  if (hotspots.length === 0) {
    return (
      <EmptyState
        title="No detections yet"
        description="Once the FIRMS ingest job runs, new thermal anomalies appear here within minutes."
        minHeight={200}
      />
    );
  }

  return (
    <ul className="divide-y divide-line">
      {hotspots.map((hotspot) => {
        const event = EVENT_TYPE_META[hotspot.eventType];
        return (
          <li key={hotspot.id}>
            <Link
              href={`/dashboard/map?focus=${hotspot.id}`}
              className="group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2"
            >
              <span
                className="mt-0.5 size-2.5 shrink-0 rounded-full ring-2 ring-surface"
                style={{ backgroundColor: event.color }}
                aria-hidden
              />

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-xs font-medium text-fg">{event.label}</p>
                  <span className="text-[10px] text-fg-subtle">{formatRelativeTime(hotspot.detectedAt)}</span>
                </div>
                <p className="tims-data mt-0.5 truncate text-[11px] text-fg-subtle">
                  {formatCoordinatePair(hotspot.latitude, hotspot.longitude)} ·{' '}
                  {formatTemperature(hotspot.brightnessTemperature)}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-fg-muted">
                  {hotspot.industrialFacility?.name ?? hotspot.region ?? 'No facility nearby'}
                </p>
              </div>

              <div className="hidden w-24 shrink-0 sm:block">
                <RiskIndicator score={hotspot.riskScore} level={hotspot.riskLevel} />
              </div>

              <ArrowUpRight
                className="size-3.5 shrink-0 text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100"
                aria-hidden
              />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
