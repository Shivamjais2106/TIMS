import type {
  ClassificationPath,
  EmergencyFacilityType,
  FacilityType,
  RiskLevel,
  Severity,
  ThermalClass,
} from '@/types';

/**
 * Single source of truth for how domain values are rendered.
 *
 * Colours are raw hex rather than Tailwind class names because Leaflet markers
 * and Recharts series need them as values. Keeping one table means a risk
 * legend, a map marker and a chart series can never disagree about what
 * "HIGH" looks like.
 *
 * The palette is deliberately narrow: two accents (rust for industrial and
 * elevated risk, sage for nominal) plus grayscale. Risk is the only scale that
 * gets four steps, because four ordered levels cannot be encoded in two hues.
 */

export const PALETTE = {
  bg: '#0a0c0e',
  surface: '#101316',
  surface2: '#14181c',
  surface3: '#191e23',
  line: '#1d2226',
  lineStrong: '#2a3137',
  fg: '#d8dcde',
  fgMuted: '#7a8086',
  fgSubtle: '#575d63',
  rust: '#c1502e',
  rustDim: '#8f3b22',
  sage: '#6b9e7a',
  sageDim: '#4e755a',
} as const;

// ---------------------------------------------------------------------------
// Risk
// ---------------------------------------------------------------------------

export interface RiskMeta {
  label: string;
  /** Dark-theme colour. Use riskColor(level, theme) to honour the light theme. */
  color: string;
  /** Light-theme colour, darkened to hold contrast against paper-white. */
  colorLight: string;
  /** Inclusive lower bound of the band, per shared/bhopal.config.json. */
  minScore: number;
  /** Short operational gloss shown beside the level. */
  note: string;
}

export const RISK_META: Record<RiskLevel, RiskMeta> = {
  LOW: { label: 'Low', color: '#6b9e7a', colorLight: '#46745a', minScore: 0, note: 'Monitor' },
  MEDIUM: { label: 'Medium', color: '#9a8c5a', colorLight: '#7a6a33', minScore: 31, note: 'Review' },
  HIGH: { label: 'High', color: '#b57340', colorLight: '#9c5720', minScore: 61, note: 'Investigate' },
  CRITICAL: { label: 'Critical', color: '#c1502e', colorLight: '#a8401f', minScore: 81, note: 'Escalate' },
};

/**
 * Risk colour for the active theme.
 *
 * The dark values are too light to sit on paper-white at 4.5:1, so the light
 * theme uses darkened equivalents. Every consumer — badge, map marker, chart
 * series, legend — goes through here so they cannot disagree.
 */
export function riskColor(level: RiskLevel, theme: 'dark' | 'light' = 'dark'): string {
  const meta = RISK_META[level];
  return theme === 'light' ? meta.colorLight : meta.color;
}

export const RISK_LEVELS = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const satisfies readonly RiskLevel[];
export const SEVERITY_META = RISK_META as Record<Severity, RiskMeta>;

// ---------------------------------------------------------------------------
// Thermal classification
// ---------------------------------------------------------------------------

export interface ThermalClassMeta {
  /** Full hedged label. Always begins "Possible" except for Unknown. */
  label: string;
  /**
   * Compact label for table cells and badges.
   *
   * Keeps the "Poss." hedge rather than shortening to a bare noun. A badge
   * reading "Vegetation" beside "High" and "Open" is read as a statement of
   * fact, which is exactly what the hedged vocabulary exists to avoid — and
   * the compact form is what appears in the densest, most-scanned places.
   */
  short: string;
  color: string;
  /** Light-theme equivalent, darkened for contrast. */
  colorLight: string;
  /** Whether this class counts as industrial in the stat cards. */
  isIndustrial: boolean;
  description: string;
}

export const THERMAL_CLASS_META: Record<ThermalClass, ThermalClassMeta> = {
  POSSIBLE_INDUSTRIAL_FIRE: {
    label: 'Possible Industrial Fire',
    short: 'Poss. industrial',
    color: '#c1502e',
    colorLight: '#a8401f',
    isIndustrial: true,
    description:
      'Detected on or beside a mapped industrial site with a real thermal signal, and not recurring — consistent with an episodic fire rather than process heat.',
  },
  POSSIBLE_PERSISTENT_THERMAL_SOURCE: {
    label: 'Possible Persistent Thermal Source',
    short: 'Poss. persistent',
    color: '#8f3b22',
    colorLight: '#7d2f16',
    isIndustrial: true,
    description:
      'Recurring heat at a fixed location near industry — consistent with a kiln, furnace or flare rather than an incident.',
  },
  POSSIBLE_VEGETATION_FIRE: {
    label: 'Possible Vegetation Fire',
    short: 'Poss. vegetation',
    color: '#6b9e7a',
    colorLight: '#46745a',
    isIndustrial: false,
    description:
      'Away from mapped industry with no agricultural signature. This is the residual class, so it absorbs ambiguous detections.',
  },
  POSSIBLE_AGRICULTURAL_BURN: {
    label: 'Possible Agricultural Burn',
    short: 'Poss. agricultural',
    color: '#9a8c5a',
    colorLight: '#7a6a33',
    isIndustrial: false,
    description:
      'Single daytime detection, low radiative power, in a harvest-residue month and away from industry.',
  },
  UNKNOWN: {
    label: 'Unknown',
    short: 'Unknown',
    color: '#575d63',
    colorLight: '#8a8f93',
    isIndustrial: false,
    description:
      'A weak, isolated signal with no industrial or agricultural context. Left unclassified rather than guessed at.',
  },
};

export const THERMAL_CLASSES = Object.keys(THERMAL_CLASS_META) as ThermalClass[];

/** Class colour for the active theme. See riskColor for the rationale. */
export function classColor(thermalClass: ThermalClass, theme: 'dark' | 'light' = 'dark'): string {
  const meta = THERMAL_CLASS_META[thermalClass];
  return theme === 'light' ? meta.colorLight : meta.color;
}

export const INDUSTRIAL_CLASSES = THERMAL_CLASSES.filter(
  (thermalClass) => THERMAL_CLASS_META[thermalClass].isIndustrial,
);

// ---------------------------------------------------------------------------
// Classification provenance
// ---------------------------------------------------------------------------

export const CLASSIFICATION_PATH_META: Record<
  ClassificationPath,
  { label: string; short: string; color: string; note: string }
> = {
  ML_SERVICE: {
    label: 'Model',
    short: 'ML',
    color: '#6b9e7a',
    note: 'Classified by the trained XGBoost model with a confidence score.',
  },
  RULE_FALLBACK: {
    label: 'Rule fallback',
    short: 'RULE',
    color: '#b57340',
    note: 'The model service was unreachable, so the transparent rule engine classified this detection. No confidence value is available.',
  },
  UNCLASSIFIED: {
    label: 'Unclassified',
    short: '—',
    color: '#575d63',
    note: 'No classification has been applied to this detection yet.',
  },
};

// ---------------------------------------------------------------------------
// Facilities
// ---------------------------------------------------------------------------

export const FACILITY_TYPE_META: Record<FacilityType, { label: string; color: string }> = {
  REFINERY: { label: 'Refinery', color: '#c1502e' },
  PETROCHEMICAL: { label: 'Petrochemical', color: '#b04a2c' },
  POWER_PLANT: { label: 'Power plant', color: '#b57340' },
  STEEL: { label: 'Steel', color: '#9a8c5a' },
  MINING: { label: 'Mining / quarry', color: '#8a7f55' },
  LNG_TERMINAL: { label: 'LNG terminal', color: '#8f3b22' },
  OTHER: { label: 'Industrial zone', color: '#7a8086' },
};

export const FACILITY_TYPES = Object.keys(FACILITY_TYPE_META) as FacilityType[];

export const EMERGENCY_TYPE_META: Record<
  EmergencyFacilityType,
  { label: string; plural: string; color: string; isResponder: boolean }
> = {
  FIRE_STATION: { label: 'Fire station', plural: 'Fire stations', color: '#c1502e', isResponder: true },
  HOSPITAL: { label: 'Hospital', plural: 'Hospitals', color: '#6b9e7a', isResponder: true },
  POLICE: { label: 'Police', plural: 'Police posts', color: '#7a8086', isResponder: true },
  SCHOOL: { label: 'School', plural: 'Schools', color: '#9a8c5a', isResponder: false },
  SHELTER: { label: 'Shelter', plural: 'Shelters', color: '#4e755a', isResponder: false },
  WATER_SOURCE: { label: 'Water source', plural: 'Water sources', color: '#577a8a', isResponder: false },
};

export const EMERGENCY_TYPES = Object.keys(EMERGENCY_TYPE_META) as EmergencyFacilityType[];

// ---------------------------------------------------------------------------
// FIRMS provenance
// ---------------------------------------------------------------------------

/**
 * How a FIRMS product string is presented.
 *
 * The NRT/SP distinction matters and is never hidden: `_SP` is the archive, so
 * a detection from it is historical rather than near-real-time.
 */
export function describeFirmsProduct(product: string | null): {
  label: string;
  latency: 'near-real-time' | 'archive' | 'unknown';
} {
  if (!product) return { label: 'Unknown product', latency: 'unknown' };

  const instrument = product.startsWith('VIIRS_NOAA20')
    ? 'VIIRS NOAA-20'
    : product.startsWith('VIIRS_NOAA21')
      ? 'VIIRS NOAA-21'
      : product.startsWith('VIIRS')
        ? 'VIIRS S-NPP'
        : product.startsWith('MODIS')
          ? 'MODIS'
          : product.startsWith('LANDSAT')
            ? 'Landsat'
            : product;

  const resolution = product.startsWith('VIIRS') ? '375 m' : product.startsWith('MODIS') ? '1 km' : '';
  const isArchive = product.endsWith('_SP');

  return {
    label: `${instrument}${resolution ? ` (${resolution})` : ''} · ${isArchive ? 'archive' : 'NRT'}`,
    latency: isArchive ? 'archive' : 'near-real-time',
  };
}

export const SOURCE_LABELS: Record<string, string> = {
  VIIRS_SNPP_NRT: 'VIIRS S-NPP',
  VIIRS_NOAA20_NRT: 'VIIRS NOAA-20',
  MODIS_NRT: 'MODIS',
  LANDSAT_NRT: 'Landsat',
  MANUAL: 'Analyst entry',
  MOCK: 'Simulated',
};

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

export const NAV_ITEMS = [
  { href: '/dashboard', label: 'Overview', code: 'OVW' },
  { href: '/dashboard/map', label: 'Live Map', code: 'MAP' },
  { href: '/dashboard/hotspots', label: 'Hotspots', code: 'HSP' },
  { href: '/dashboard/industries', label: 'Industry', code: 'IND' },
  { href: '/dashboard/emergency', label: 'Emergency', code: 'EMR' },
  { href: '/dashboard/analytics', label: 'Analytics', code: 'ANL' },
  { href: '/dashboard/alerts', label: 'Alerts', code: 'ALT' },
  { href: '/dashboard/reports', label: 'Reports', code: 'RPT' },
  { href: '/dashboard/sources', label: 'Data Sources', code: 'SRC' },
  { href: '/dashboard/settings', label: 'Settings', code: 'CFG' },
] as const;

// ---------------------------------------------------------------------------
// Standing disclaimers
//
// Held here so the same wording appears everywhere and cannot drift into
// something that overclaims.
// ---------------------------------------------------------------------------

export const DISCLAIMERS = {
  decisionSupport: 'Decision Support — Not an Official Emergency Alert',
  classification:
    'Classifications are advisory. The model is trained on heuristic weak labels, not verified ground truth.',
  risk: 'Risk is a transparent weighted triage score, not a validated probability of fire.',
  population: 'Population estimate unavailable — no gridded population dataset is loaded.',
  distances: 'Distances are straight-line (geodesic) and ignore the road network.',
} as const;
