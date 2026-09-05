'use client';

import { Eye, EyeOff, Factory, Flame } from 'lucide-react';
import { EVENT_TYPES, EVENT_TYPE_META, RISK_LEVELS, RISK_META } from '@/lib/constants';
import { cn } from '@/lib/utils';
import type { EventType, RiskLevel } from '@/types';

export interface MapFilterState {
  eventTypes: EventType[];
  riskLevels: RiskLevel[];
  showFacilities: boolean;
  showHotspots: boolean;
  radiusKm: number;
}

interface MapFiltersProps {
  value: MapFilterState;
  onChange: (next: MapFilterState) => void;
  className?: string;
}

function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((entry) => entry !== item) : [...list, item];
}

export function MapFilters({ value, onChange, className }: MapFiltersProps) {
  return (
    <div
      className={cn(
        'pointer-events-auto w-[210px] space-y-3 rounded-lg border border-line bg-surface/95 p-3 shadow-lg backdrop-blur',
        className,
      )}
    >
      <div>
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">Layers</p>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => onChange({ ...value, showHotspots: !value.showHotspots })}
            aria-pressed={value.showHotspots}
            className={cn(
              'inline-flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[10px] font-medium ring-1 ring-inset transition-colors',
              value.showHotspots
                ? 'bg-primary/12 text-primary ring-primary/30'
                : 'text-fg-subtle ring-line hover:bg-surface-3',
            )}
          >
            <Flame className="size-3" aria-hidden />
            Hotspots
          </button>
          <button
            type="button"
            onClick={() => onChange({ ...value, showFacilities: !value.showFacilities })}
            aria-pressed={value.showFacilities}
            className={cn(
              'inline-flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[10px] font-medium ring-1 ring-inset transition-colors',
              value.showFacilities
                ? 'bg-primary/12 text-primary ring-primary/30'
                : 'text-fg-subtle ring-line hover:bg-surface-3',
            )}
          >
            <Factory className="size-3" aria-hidden />
            Facilities
          </button>
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">Event type</p>
          <button
            type="button"
            onClick={() =>
              onChange({ ...value, eventTypes: value.eventTypes.length === EVENT_TYPES.length ? [] : [...EVENT_TYPES] })
            }
            className="text-[10px] text-primary hover:underline"
          >
            {value.eventTypes.length === EVENT_TYPES.length ? 'None' : 'All'}
          </button>
        </div>
        <ul className="space-y-1">
          {EVENT_TYPES.map((type) => {
            const active = value.eventTypes.includes(type);
            return (
              <li key={type}>
                <button
                  type="button"
                  onClick={() => onChange({ ...value, eventTypes: toggle(value.eventTypes, type) })}
                  aria-pressed={active}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-[11px] transition-colors',
                    active ? 'text-fg' : 'text-fg-subtle hover:bg-surface-3',
                  )}
                >
                  <span
                    className="size-2.5 shrink-0 rounded-full ring-1 ring-inset ring-black/10"
                    style={{ backgroundColor: active ? EVENT_TYPE_META[type].color : 'transparent',
                             borderColor: EVENT_TYPE_META[type].color }}
                    aria-hidden
                  />
                  <span className="flex-1 truncate">{EVENT_TYPE_META[type].label}</span>
                  {active ? <Eye className="size-3 opacity-50" aria-hidden /> : <EyeOff className="size-3 opacity-40" aria-hidden />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div>
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">Risk level</p>
        <div className="flex flex-wrap gap-1">
          {RISK_LEVELS.map((level) => {
            const active = value.riskLevels.includes(level);
            return (
              <button
                key={level}
                type="button"
                onClick={() => onChange({ ...value, riskLevels: toggle(value.riskLevels, level) })}
                aria-pressed={active}
                className={cn(
                  'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ring-1 ring-inset transition-colors',
                  active ? '' : 'text-fg-subtle ring-line hover:bg-surface-3',
                )}
                style={
                  active
                    ? {
                        backgroundColor: `${RISK_META[level].color}22`,
                        color: RISK_META[level].color,
                        borderColor: RISK_META[level].color,
                      }
                    : undefined
                }
              >
                {RISK_META[level].label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label htmlFor="map-radius" className="mb-1 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">
          Analysis radius
          <span className="tims-data text-[10px] font-medium normal-case text-fg-muted">{value.radiusKm} km</span>
        </label>
        <input
          id="map-radius"
          type="range"
          min={2}
          max={50}
          step={1}
          value={value.radiusKm}
          onChange={(event) => onChange({ ...value, radiusKm: Number(event.target.value) })}
          className="w-full accent-[var(--tims-primary)]"
        />
      </div>
    </div>
  );
}
