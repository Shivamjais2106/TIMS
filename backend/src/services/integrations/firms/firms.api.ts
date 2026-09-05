import { env } from '../../../config/env';
import type { HotspotSource } from '../../../generated/prisma/enums';
import { createLogger } from '../../../utils/logger';
import type { FirmsDetection, FirmsFetchParams, FirmsProvider } from './firms.types';

const log = createLogger('firms:api');

/**
 * Maps a FIRMS product name onto our HotspotSource enum. Unknown products are
 * accepted and recorded as MODIS_NRT rather than rejected outright.
 */
function toHotspotSource(product: string): HotspotSource {
  const normalised = product.toUpperCase();
  if (normalised.includes('NOAA20') || normalised.includes('NOAA-20')) return 'VIIRS_NOAA20_NRT';
  if (normalised.includes('VIIRS')) return 'VIIRS_SNPP_NRT';
  if (normalised.includes('LANDSAT')) return 'LANDSAT_NRT';
  return 'MODIS_NRT';
}

/**
 * FIRMS reports confidence differently per product:
 *   MODIS  - integer 0-100
 *   VIIRS  - "l" | "n" | "h"
 * Both are normalised to 0-100 here.
 */
function normaliseConfidence(raw: string): number {
  const trimmed = raw.trim().toLowerCase();
  if (trimmed === 'l' || trimmed === 'low') return 30;
  if (trimmed === 'n' || trimmed === 'nominal') return 70;
  if (trimmed === 'h' || trimmed === 'high') return 95;
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(100, Math.round(numeric))) : 50;
}

/** FIRMS gives `acq_date` = YYYY-MM-DD and `acq_time` = HHMM, both UTC. */
function parseAcquisition(acqDate: string, acqTime: string): Date {
  const padded = acqTime.padStart(4, '0');
  const hours = padded.slice(0, 2);
  const minutes = padded.slice(2, 4);
  return new Date(`${acqDate}T${hours}:${minutes}:00Z`);
}

/** Minimal RFC-4180-ish CSV reader — FIRMS output is unquoted and flat. */
function parseCsv(text: string): Array<Record<string, string>> {
  const lines = text.trim().split(/\r?\n/);
  const headerLine = lines.shift();
  if (!headerLine) return [];

  const headers = headerLine.split(',').map((header) => header.trim());

  return lines
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const cells = line.split(',');
      const row: Record<string, string> = {};
      headers.forEach((header, index) => {
        row[header] = (cells[index] ?? '').trim();
      });
      return row;
    });
}

/**
 * Live NASA FIRMS provider.
 *
 * Endpoint shape:
 *   {base}/area/csv/{MAP_KEY}/{PRODUCT}/{west,south,east,north}/{dayRange}
 *
 * This class is fully implemented but only instantiated when FIRMS_MAP_KEY is
 * set — see firms.provider.ts. It has no other dependency on application state,
 * so it can be unit-tested against a recorded CSV fixture.
 */
export class NasaFirmsProvider implements FirmsProvider {
  readonly name = 'firms-nasa';
  readonly isLive = true;

  async fetchDetections(params: FirmsFetchParams): Promise<FirmsDetection[]> {
    const [minLon, minLat, maxLon, maxLat] = params.bbox;
    const area = `${minLon},${minLat},${maxLon},${maxLat}`;
    const url = `${env.FIRMS_BASE_URL}/area/csv/${env.FIRMS_MAP_KEY}/${params.source}/${area}/${params.dayRange}`;

    log.info('Fetching FIRMS detections', { source: params.source, area, dayRange: params.dayRange });

    const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });

    if (!response.ok) {
      throw new Error(`FIRMS responded ${response.status} ${response.statusText}`);
    }

    const body = await response.text();

    // FIRMS returns a plain-text error page (HTTP 200) for an invalid key.
    if (body.startsWith('Invalid') || body.includes('Invalid MAP_KEY')) {
      throw new Error('FIRMS rejected the MAP_KEY. Check FIRMS_MAP_KEY in your environment.');
    }

    const source = toHotspotSource(params.source);

    return parseCsv(body)
      .map((row) => this.toDetection(row, source))
      .filter((detection): detection is FirmsDetection => detection !== null);
  }

  private toDetection(row: Record<string, string>, source: HotspotSource): FirmsDetection | null {
    const latitude = Number(row['latitude']);
    const longitude = Number(row['longitude']);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

    const acqDate = row['acq_date'];
    const acqTime = row['acq_time'];
    if (!acqDate || !acqTime) return null;

    const detectedAt = parseAcquisition(acqDate, acqTime);
    if (Number.isNaN(detectedAt.getTime())) return null;

    // VIIRS uses bright_ti4, MODIS uses brightness.
    const brightness = Number(row['bright_ti4'] ?? row['brightness'] ?? row['bright_t31']);
    if (!Number.isFinite(brightness)) return null;

    const frpRaw = Number(row['frp']);
    const satellite = row['satellite'] ?? 'unknown';
    const dayNight = (row['daynight'] ?? 'D').toUpperCase() === 'N' ? 'N' : 'D';

    return {
      externalId: `${satellite}:${detectedAt.toISOString()}:${latitude.toFixed(4)}:${longitude.toFixed(4)}`,
      latitude,
      longitude,
      detectedAt,
      confidence: normaliseConfidence(row['confidence'] ?? ''),
      brightnessTemperature: brightness,
      frp: Number.isFinite(frpRaw) ? frpRaw : null,
      satellite,
      dayNight,
      source,
    };
  }
}
