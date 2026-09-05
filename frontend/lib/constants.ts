import type { EventType, FacilityType, RiskLevel, Severity } from '@/types';

/**
 * Single source of truth for how domain values are rendered.
 *
 * Colours are raw hex (not Tailwind classes) because Leaflet markers and
 * Recharts series need them as values, and drifting between a CSS class and a
 * chart colour is exactly how a risk legend stops meaning anything.
 */

export interface EventTypeMeta {
  label: string;
  shortLabel: string;
  color: string;
  description: string;
}

export const EVENT_TYPE_META: Record<EventType, EventTypeMeta> = {
  INDUSTRIAL_FIRE: {
    label: 'Industrial Fire',
    shortLabel: 'Industrial',
    color: '#ef4444',
    description: 'Uncontrolled combustion on or adjacent to an industrial site',
  },
  GAS_FLARE: {
    label: 'Gas Flare',
    shortLabel: 'Flare',
    color: '#f97316',
    description: 'Continuous high-temperature flare stack, typical of refineries',
  },
  MINING_ACTIVITY: {
    label: 'Mining Activity',
    shortLabel: 'Mining',
    color: '#a855f7',
    description: 'Persistent moderate heat over open-cast or coal-seam workings',
  },
  FOREST_FIRE: {
    label: 'Forest Fire',
    shortLabel: 'Forest',
    color: '#16a34a',
    description: 'High radiative power vegetation fire away from industry',
  },
  AGRICULTURAL_FIRE: {
    label: 'Agricultural Fire',
    shortLabel: 'Agri',
    color: '#eab308',
    description: 'Short-lived low-power crop residue burning',
  },
  OTHER: {
    label: 'Unclassified',
    shortLabel: 'Other',
    color: '#64748b',
    description: 'Thermal anomaly that does not match a known signature',
  },
};

export const EVENT_TYPES = Object.keys(EVENT_TYPE_META) as EventType[];

/** Industrial event types — the ones this system exists to surface. */
export const INDUSTRIAL_EVENT_TYPES: EventType[] = ['INDUSTRIAL_FIRE', 'GAS_FLARE'];

export interface RiskMeta {
  label: string;
  color: string;
  /** Tailwind utilities for chips and badges. */
  badgeClass: string;
  dotClass: string;
  minScore: number;
}

export const RISK_META: Record<RiskLevel, RiskMeta> = {
  LOW: {
    label: 'Low',
    color: '#38bdf8',
    badgeClass: 'bg-sky-500/12 text-sky-600 dark:text-sky-300 ring-1 ring-inset ring-sky-500/30',
    dotClass: 'bg-sky-500',
    minScore: 0,
  },
  MEDIUM: {
    label: 'Medium',
    color: '#f59e0b',
    badgeClass: 'bg-amber-500/12 text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-500/30',
    dotClass: 'bg-amber-500',
    minScore: 35,
  },
  HIGH: {
    label: 'High',
    color: '#f97316',
    badgeClass: 'bg-orange-500/12 text-orange-700 dark:text-orange-300 ring-1 ring-inset ring-orange-500/30',
    dotClass: 'bg-orange-500',
    minScore: 60,
  },
  CRITICAL: {
    label: 'Critical',
    color: '#ef4444',
    badgeClass: 'bg-red-500/14 text-red-700 dark:text-red-300 ring-1 ring-inset ring-red-500/35',
    dotClass: 'bg-red-500',
    minScore: 80,
  },
};

export const RISK_LEVELS = Object.keys(RISK_META) as RiskLevel[];
export const SEVERITY_META = RISK_META as Record<Severity, RiskMeta>;

export interface FacilityTypeMeta {
  label: string;
  color: string;
  /** Single-glyph label used inside map markers. */
  glyph: string;
}

export const FACILITY_TYPE_META: Record<FacilityType, FacilityTypeMeta> = {
  REFINERY: { label: 'Refinery', color: '#0ea5e9', glyph: 'R' },
  PETROCHEMICAL: { label: 'Petrochemical', color: '#8b5cf6', glyph: 'P' },
  POWER_PLANT: { label: 'Power Plant', color: '#14b8a6', glyph: 'E' },
  STEEL: { label: 'Steel Plant', color: '#f43f5e', glyph: 'S' },
  MINING: { label: 'Mining', color: '#a16207', glyph: 'M' },
  LNG_TERMINAL: { label: 'LNG Terminal', color: '#6366f1', glyph: 'L' },
  OTHER: { label: 'Other Facility', color: '#64748b', glyph: 'O' },
};

export const FACILITY_TYPES = Object.keys(FACILITY_TYPE_META) as FacilityType[];

export const SOURCE_LABELS: Record<string, string> = {
  VIIRS_SNPP_NRT: 'VIIRS S-NPP',
  VIIRS_NOAA20_NRT: 'VIIRS NOAA-20',
  MODIS_NRT: 'MODIS',
  LANDSAT_NRT: 'Landsat',
  MANUAL: 'Analyst entry',
  MOCK: 'Simulated',
};

/** A source is treated as persistent once it has been seen on this many days. */
export const PERSISTENT_SOURCE_DAYS = 3;

/** Default map view: centred on India, zoomed to show the whole subcontinent. */
export const MAP_DEFAULTS = {
  center: [22.35, 79.0] as [number, number],
  zoom: 5,
  minZoom: 3,
  maxZoom: 17,
};

export const NAV_ITEMS = [
  { href: '/dashboard', label: 'Overview', icon: 'LayoutDashboard' },
  { href: '/dashboard/map', label: 'Thermal Map', icon: 'Map' },
  { href: '/dashboard/hotspots', label: 'Hotspots', icon: 'Flame' },
  { href: '/dashboard/industries', label: 'Facilities', icon: 'Factory' },
  { href: '/dashboard/analytics', label: 'Analytics', icon: 'ChartColumn' },
  { href: '/dashboard/alerts', label: 'Alerts', icon: 'BellRing' },
] as const;
