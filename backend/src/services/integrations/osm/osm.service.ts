import { env } from '../../../config/env';
import { prisma } from '../../../config/prisma';
import { createLogger } from '../../../utils/logger';
import { getOsmProvider } from './osm.provider';
import type { OsmFacility } from './osm.types';

const log = createLogger('osm');

export interface OsmSyncResult {
  provider: string;
  live: boolean;
  fetched: number;
  created: number;
  updated: number;
  skipped: number;
  durationMs: number;
  error?: string;
}

function parseBbox(value: string): [number, number, number, number] {
  const parts = value.split(',').map(Number);
  if (parts.length !== 4 || parts.some(Number.isNaN)) {
    // Fall back to the India bounding box rather than aborting a scheduled job.
    return [68.0, 6.0, 98.0, 38.0];
  }
  return parts as [number, number, number, number];
}

/**
 * Pulls industrial facilities from the active provider and upserts them.
 *
 * Upsert keys on `osmId`, so re-running the sync updates existing rows instead
 * of duplicating them, and manually created facilities (which have no osmId)
 * are never touched.
 */
export async function syncFacilities(options: { bbox?: string; limit?: number } = {}): Promise<OsmSyncResult> {
  const startedAt = Date.now();
  const provider = getOsmProvider();
  const bbox = parseBbox(options.bbox ?? env.FIRMS_AREA);

  const result: OsmSyncResult = {
    provider: provider.name,
    live: provider.isLive,
    fetched: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    durationMs: 0,
  };

  let facilities: OsmFacility[] = [];
  try {
    facilities = await provider.fetchFacilities({ bbox, limit: options.limit ?? 500 });
    result.fetched = facilities.length;
  } catch (error) {
    // A failing upstream must never take the API down.
    result.error = error instanceof Error ? error.message : 'Unknown OSM error';
    result.durationMs = Date.now() - startedAt;
    log.error('Facility sync failed', { error: result.error });
    return result;
  }

  for (const facility of facilities) {
    try {
      const existing = await prisma.industrialFacility.findUnique({
        where: { osmId: facility.osmId },
        select: { id: true },
      });

      if (existing) {
        await prisma.industrialFacility.update({
          where: { id: existing.id },
          data: {
            name: facility.name,
            type: facility.type,
            latitude: facility.latitude,
            longitude: facility.longitude,
            location: facility.location,
            operator: facility.operator ?? null,
          },
        });
        result.updated += 1;
      } else {
        await prisma.industrialFacility.create({
          data: {
            osmId: facility.osmId,
            name: facility.name,
            type: facility.type,
            latitude: facility.latitude,
            longitude: facility.longitude,
            location: facility.location,
            riskLevel: facility.riskLevel,
            operator: facility.operator ?? null,
          },
        });
        result.created += 1;
      }
    } catch (error) {
      result.skipped += 1;
      log.warn(`Skipped facility ${facility.osmId}`, {
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  result.durationMs = Date.now() - startedAt;
  log.info('Facility sync complete', result);
  return result;
}
