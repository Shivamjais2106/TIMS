/**
 * Formatting helpers.
 *
 * All of these are deterministic and locale-pinned to en-IN + UTC-agnostic
 * relative strings, so server and client renders agree and React never reports
 * a hydration mismatch.
 */

const NUMBER = new Intl.NumberFormat('en-IN');
const DECIMAL = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return NUMBER.format(Math.round(value));
}

export function formatDecimal(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return DECIMAL.format(value);
}

/** Coordinates always render at 4 dp (about 11 m) with a hemisphere suffix. */
export function formatCoordinate(value: number, axis: 'lat' | 'lng'): string {
  const hemisphere = axis === 'lat' ? (value >= 0 ? 'N' : 'S') : value >= 0 ? 'E' : 'W';
  return `${Math.abs(value).toFixed(4)}° ${hemisphere}`;
}

export function formatCoordinatePair(latitude: number, longitude: number): string {
  return `${formatCoordinate(latitude, 'lat')}, ${formatCoordinate(longitude, 'lng')}`;
}

export function formatTemperature(kelvin: number | null | undefined): string {
  if (kelvin === null || kelvin === undefined) return '—';
  return `${kelvin.toFixed(1)} K`;
}

export function formatTemperatureCelsius(kelvin: number | null | undefined): string {
  if (kelvin === null || kelvin === undefined) return '—';
  return `${(kelvin - 273.15).toFixed(1)} °C`;
}

export function formatPower(megawatts: number | null | undefined): string {
  if (megawatts === null || megawatts === undefined) return '—';
  return `${megawatts.toFixed(1)} MW`;
}

export function formatDistance(meters: number | null | undefined): string {
  if (meters === null || meters === undefined) return '—';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(meters < 10_000 ? 2 : 1)} km`;
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${value.toFixed(digits)}%`;
}

export function formatSignedPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

const DATE_TIME = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Asia/Kolkata',
});

const DATE_ONLY = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Kolkata',
});

const TIME_ONLY = new Intl.DateTimeFormat('en-IN', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Asia/Kolkata',
});

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return `${DATE_TIME.format(date)} IST`;
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return DATE_ONLY.format(date);
}

export function formatTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return TIME_ONLY.format(date);
}

/** Compact table format: "05 Sep, 23:44". Omits the year and zone to fit a column. */
export function formatDateTimeShort(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Kolkata',
  }).format(date);
}

/** Short chart axis label: "05 Sep". */
export function formatAxisDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', timeZone: 'Asia/Kolkata' }).format(date);
}

export function formatRelativeTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';

  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)} h ago`;
  if (seconds < 604_800) return `${Math.floor(seconds / 86_400)} d ago`;
  return formatDate(date);
}

export function formatDuration(days: number): string {
  if (days <= 1) return 'Single pass';
  if (days < 7) return `${days} days`;
  if (days < 30) return `${Math.floor(days / 7)} week${days >= 14 ? 's' : ''}`;
  return `${Math.floor(days / 30)} month${days >= 60 ? 's' : ''}`;
}

/** Turns SCREAMING_SNAKE_CASE into "Title Case". */
export function humanise(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** Shortens a cuid for display: "cm3x…9fq2". */
export function shortId(id: string, head = 6, tail = 4): string {
  if (id.length <= head + tail + 1) return id;
  return `${id.slice(0, head)}…${id.slice(-tail)}`;
}
