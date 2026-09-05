'use client';

import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { FACILITY_TYPE_META, RISK_LEVELS, RISK_META } from '@/lib/constants';
import { cn } from '@/lib/utils';

/**
 * Map key.
 *
 * Covers only the encodings the filter panel does not already show: marker size
 * (risk) and the facility glyphs. Collapsible because on a phone a pinned
 * legend would cover a third of the map.
 */
export function MapLegend({ className }: { className?: string }) {
  const [open, setOpen] = useState(true);

  return (
    <div
      className={cn(
        'pointer-events-auto w-[190px] rounded-lg border border-line bg-surface/95 shadow-lg backdrop-blur',
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-fg-muted"
      >
        Legend
        <ChevronDown className={cn('size-3.5 transition-transform', open ? '' : '-rotate-90')} aria-hidden />
      </button>

      {open ? (
        <div className="space-y-3 border-t border-line px-3 py-2.5">
          <div>
            <p className="mb-1.5 text-[10px] uppercase tracking-wide text-fg-subtle">Marker size = risk</p>
            <ul className="flex items-end gap-2.5">
              {RISK_LEVELS.map((level, index) => (
                <li key={level} className="flex flex-col items-center gap-1">
                  <span
                    className="rounded-full"
                    style={{
                      width: 5 + index * 3,
                      height: 5 + index * 3,
                      backgroundColor: RISK_META[level].color,
                    }}
                    aria-hidden
                  />
                  <span className="text-[9px] text-fg-subtle">{RISK_META[level].label}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-1.5 text-[10px] uppercase tracking-wide text-fg-subtle">Facilities</p>
            <ul className="grid grid-cols-2 gap-x-2 gap-y-1">
              {(['REFINERY', 'PETROCHEMICAL', 'POWER_PLANT', 'STEEL', 'MINING', 'LNG_TERMINAL'] as const).map(
                (type) => (
                  <li key={type} className="flex items-center gap-1.5 text-[10px] text-fg">
                    <span
                      className="grid size-3.5 shrink-0 place-items-center rounded-[3px] text-[7px] font-bold text-white"
                      style={{ backgroundColor: FACILITY_TYPE_META[type].color }}
                      aria-hidden
                    >
                      {FACILITY_TYPE_META[type].glyph}
                    </span>
                    <span className="truncate">{FACILITY_TYPE_META[type].label}</span>
                  </li>
                ),
              )}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}
