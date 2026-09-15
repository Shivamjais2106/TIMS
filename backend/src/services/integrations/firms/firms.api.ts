import { env } from '../../../config/env';
import { FIRMS_LIMITS } from '../../../config/bhopal';
import type { HotspotSource } from '../../../generated/prisma/enums';
import { createLogger } from '../../../utils/logger';
import type { FirmsDetection, FirmsFetchParams, FirmsProvider } from './firms.types';

const log = createLogger('firms:api');

/**
 * Maps a FIRMS product name onto our HotspotSource enum.
 *
 * Both NRT and SP (archive) variants of a product map to the same source: the
 * satellite and instrument are identical, only the processing latency differs.
 */
function toHotspotSource(product: string): HotspotSource {
  const normalised = product.toUpperCase();
  if (normalised.includes('NOAA20') || normalised.includes('NOAA-20')) return 'VIIRS_NOAA20_NRT';
  if (normalised.includes('NOAA21') || normalised.includes('NOAA-21')) return 'VIIRS_NOAA20_NRT';
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

/** Minimal CSV reader — FIRMS output is unquoted and flat. */
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
 * Endpoint shapes:
 *   {base}/area/csv/{MAP_KEY}/{PRODUCT}/{west,south,east,north}/{dayRange}
 *   {base}/area/csv/{MAP_KEY}/{PRODUCT}/{west,south,east,north}/{dayRange}/{startDate}
 *
 * The second form reads the archive and is what the fire-season fallback uses.
 */
export class NasaFirmsProvider implements FirmsProvider {
  readonly name = 'firms-nasa';
  readonly isLive = true;

  async fetchDetections(params: FirmsFetchParams): Promise<FirmsDetection[]> {
    const [minLng, minLat, maxLng, maxLat] = params.bbox;
    const area = `${minLng},${minLat},${maxLng},${maxLat}`;

    // Clamping here rather than trusting the caller: FIRMS answers HTTP 400 for
    // anything above 5, which would otherwise fail the whole ingest cycle.
    const dayRange = Math.min(Math.max(1, Math.trunc(params.dayRange)), FIRMS_LIMITS.maxDayRange);
    if (dayRange !== params.dayRange) {
      log.warn(`dayRange ${params.dayRange} clamped to ${dayRange} (FIRMS allows 1..${FIRMS_LIMITS.maxDayRange})`);
    }

    const path = `/area/csv/${env.FIRMS_MAP_KEY}/${params.product}/${area}/${dayRange}`;
    const url = `${env.FIRMS_BASE_URL}${path}${params.startDate ? `/${params.startDate}` : ''}`;

    log.info('Fetching FIRMS detections', {
      product: params.product,
      area,
      dayRange,
      startDate: params.startDate ?? '(trailing window)',
    });

    const response = await fetch(url, {
      signal: AbortSignal.timeout(90_000),
      headers: { Accept: 'text/csv' },
    });

    const body = await response.text();

    if (!response.ok) {
      // FIRMS puts an actionable message in the body, e.g. "Invalid day range".
      throw new Error(
        `FIRMS responded ${response.status} ${response.statusText} for ${params.product}: ${body.slice(0, 200).trim()}`,
      );
    }

    // FIRMS returns a plain-text error page with HTTP 200 for a bad key.
    if (/^invalid/i.test(body.trim()) || body.includes('Invalid MAP_KEY')) {
      throw new Error(`FIRMS rejected the request: ${body.slice(0, 200).trim()}`);
    }

    const source = toHotspotSource(params.product);

    const detections = parseCsv(body)
      .map((row) => this.toDetection(row, source, params.product))
      .filter((detection): detection is FirmsDetection => detection !== null);

    log.info(`FIRMS returned ${detections.length} usable detection(s) for ${params.product}`);
    return detections;
  }

  private toDetection(
    row: Record<string, string>,
    source: HotspotSource,
    product: string,
  ): FirmsDetection | null {
    const latitude = Number(row['latitude']);
    const longitude = Number(row['longitude']);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

    const acqDate = row['acq_date'];
    const acqTime = row['acq_time'];
    if (!acqDate || !acqTime) return null;

    const detectedAt = parseAcquisition(acqDate, acqTime);
    if (Number.isNaN(detectedAt.getTime())) return null;

    // VIIRS reports bright_ti4; MODIS reports brightness. Fall back to the
    // 11 µm channel only if the primary one is absent.
    const brightness = Number(row['bright_ti4'] ?? row['brightness'] ?? row['bright_t31']);
    if (!Number.isFinite(brightness)) return null;

    const frpRaw = Number(row['frp']);
    const satellite = row['satellite'] || 'unknown';
    const dayNight = (row['daynight'] || 'D').toUpperCase() === 'N' ? 'N' : 'D';

    return {
      // Rounded to 4 dp (~11 m) so the same pixel re-delivered by FIRMS
      // de-duplicates, while genuinely distinct pixels stay distinct.
      externalId: `${product}:${satellite}:${detectedAt.toISOString()}:${latitude.toFixed(4)}:${longitude.toFixed(4)}`,
      latitude,
      longitude,
      detectedAt,
      confidence: normaliseConfidence(row['confidence'] ?? ''),
      brightnessTemperature: brightness,
      frp: Number.isFinite(frpRaw) ? frpRaw : null,
      satellite,
      instrument: row['instrument'] || null,
      dayNight,
      source,
      product,
    };
  }
}
