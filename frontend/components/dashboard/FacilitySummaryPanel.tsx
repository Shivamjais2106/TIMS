'use client';

import Link from 'next/link';
import { FACILITY_TYPE_META } from '@/lib/constants';
import { formatNumber } from '@/lib/format';
import type { FacilitySummary } from '@/types';
import { RiskBadge } from '../ui/Badge';
import { EmptyState } from '../ui/EmptyState';

/** Facilities ranked by how much thermal activity has been observed on them. */
export function FacilitySummaryPanel({ summary }: { summary: FacilitySummary }) {
  if (summary.topFacilities.length === 0) {
    return (
      <EmptyState
        title="No facilities registered"
        description="Run the OSM sync job or add facilities manually to start correlating detections."
        minHeight={200}
      />
    );
  }

  const max = Math.max(1, ...summary.topFacilities.map((facility) => facility.hotspotCount));

  return (
    <div>
      <ul className="divide-y divide-line">
        {summary.topFacilities.map((facility) => {
          const meta = FACILITY_TYPE_META[facility.type];
          return (
            <li key={facility.id}>
              <Link
                href={`/dashboard/industries?focus=${facility.id}`}
                className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2"
              >
                <span
                  className="grid size-7 shrink-0 place-items-center rounded-md text-[10px] font-bold text-white"
                  style={{ backgroundColor: meta.color }}
                  aria-hidden
                >
                  {meta.glyph}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-fg">{facility.name}</p>
                  <p className="truncate text-[11px] text-fg-subtle">
                    {meta.label} · {facility.location}
                  </p>
                  <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-surface-3">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${(facility.hotspotCount / max) * 100}%`, backgroundColor: meta.color }}
                    />
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  <p className="tims-data text-sm font-semibold text-fg">{formatNumber(facility.hotspotCount)}</p>
                  <p className="text-[10px] text-fg-subtle">events</p>
                </div>

                <RiskBadge level={facility.riskLevel} className="hidden shrink-0 sm:inline-flex" />
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap gap-1.5 border-t border-line px-5 py-3">
        {summary.byType.map((entry) => (
          <span
            key={entry.type}
            className="inline-flex items-center gap-1.5 rounded-md bg-surface-3 px-2 py-0.5 text-[10px] text-fg-muted ring-1 ring-inset ring-line"
          >
            <span
              className="size-1.5 rounded-full"
              style={{ backgroundColor: FACILITY_TYPE_META[entry.type].color }}
              aria-hidden
            />
            {FACILITY_TYPE_META[entry.type].label}
            <span className="tims-data font-semibold text-fg">{entry.count}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
