'use client';

import { LayerToggle } from '@/components/ui/Button';
import { EMERGENCY_TYPE_META, riskColor, RISK_LEVELS, RISK_META } from '@/lib/constants';
import { useTheme } from '@/hooks/useTheme';
import { cn } from '@/lib/utils';
import type { MapLayers } from './ThermalMap';

/**
 * Layer switches and the risk legend.
 *
 * Layers are toggles rather than a dropdown: on a monitoring console every
 * available layer should be visible and one click away.
 */
export function MapControls({
  layers,
  onChange,
  counts,
  className,
}: {
  layers: MapLayers;
  onChange: (layers: MapLayers) => void;
  counts?: Partial<Record<keyof MapLayers, number>>;
  className?: string;
}) {
  const { theme } = useTheme();

  function toggle(key: keyof MapLayers) {
    return (checked: boolean) => onChange({ ...layers, [key]: checked });
  }

  return (
    <div className={cn('divide-y divide-line', className)}>
      <div className="p-2">
        <p className="tims-label mb-1">Detections &amp; facilities</p>
        <LayerToggle
          label="Thermal detections"
          checked={layers.hotspots}
          onChange={toggle('hotspots')}
          color="#c1502e"
          count={counts?.hotspots}
        />
        <LayerToggle
          label="Industrial sites"
          checked={layers.industry}
          onChange={toggle('industry')}
          color="#b57340"
          count={counts?.industry}
        />
      </div>

      <div className="p-2">
        <p className="tims-label mb-1">Emergency &amp; receptors</p>
        <LayerToggle
          label={EMERGENCY_TYPE_META.FIRE_STATION.plural}
          checked={layers.fireStations}
          onChange={toggle('fireStations')}
          color={EMERGENCY_TYPE_META.FIRE_STATION.color}
          count={counts?.fireStations}
        />
        <LayerToggle
          label={EMERGENCY_TYPE_META.HOSPITAL.plural}
          checked={layers.hospitals}
          onChange={toggle('hospitals')}
          color={EMERGENCY_TYPE_META.HOSPITAL.color}
          count={counts?.hospitals}
        />
        <LayerToggle
          label={EMERGENCY_TYPE_META.SCHOOL.plural}
          checked={layers.schools}
          onChange={toggle('schools')}
          color={EMERGENCY_TYPE_META.SCHOOL.color}
          count={counts?.schools}
        />
      </div>

      <div className="p-2">
        <p className="tims-label mb-1">Reference geometry</p>
        <LayerToggle
          label="Bhopal district boundary"
          checked={layers.boundary}
          onChange={toggle('boundary')}
          color="#7a8086"
        />
        <LayerToggle
          label="FIRMS fetch envelope"
          checked={layers.fetchBbox}
          onChange={toggle('fetchBbox')}
          color="#c1502e"
        />
        <LayerToggle
          label="Impact zones (1/3/5 km)"
          checked={layers.impactZones}
          onChange={toggle('impactZones')}
          color="#c1502e"
        />
      </div>

      <div className="p-2">
        <p className="tims-label mb-1.5">Risk scale</p>
        <ul className="space-y-1">
          {RISK_LEVELS.map((level) => {
            const meta = RISK_META[level];
            const color = riskColor(level, theme);
            return (
              <li key={level} className="flex items-center gap-2" title={meta.note}>
                <span
                  className="flex-none"
                  style={{
                    width: level === 'CRITICAL' ? 13 : level === 'HIGH' ? 11 : level === 'MEDIUM' ? 9 : 7,
                    height: level === 'CRITICAL' ? 13 : level === 'HIGH' ? 11 : level === 'MEDIUM' ? 9 : 7,
                    background: color,
                  }}
                  aria-hidden
                />
                <span className="flex-1 text-[11px] text-fg-muted">{meta.label}</span>
                <span className="tims-data text-[10px] text-fg-subtle">{meta.minScore}+</span>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-[9px] leading-snug text-fg-subtle">
          Marker size and colour encode the same risk score. Only critical detections pulse.
        </p>
      </div>
    </div>
  );
}

/** Compact legend overlaid on the map itself. */
export function MapLegendOverlay({ className }: { className?: string }) {
  const { theme } = useTheme();

  return (
    <div
      className={cn(
        'pointer-events-none absolute bottom-2 left-2 z-[400] border border-line bg-bg/92 px-2 py-1.5 backdrop-blur',
        className,
      )}
    >
      <p className="tims-label mb-1">Risk</p>
      <div className="flex items-end gap-2">
        {RISK_LEVELS.slice()
          .reverse()
          .map((level) => (
            <div key={level} className="flex flex-col items-center gap-1">
              <span
                style={{
                  width: level === 'CRITICAL' ? 12 : level === 'HIGH' ? 10 : level === 'MEDIUM' ? 8 : 6,
                  height: level === 'CRITICAL' ? 12 : level === 'HIGH' ? 10 : level === 'MEDIUM' ? 8 : 6,
                  background: riskColor(level, theme),
                }}
                aria-hidden
              />
              <span className="tims-data text-[8px] text-fg-subtle">{RISK_META[level].label[0]}</span>
            </div>
          ))}
      </div>
    </div>
  );
}
