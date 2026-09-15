import { BHOPAL_BBOX } from '../../../config/bhopal';
import { env } from '../../../config/env';
import { prisma } from '../../../config/prisma';
import { createLogger } from '../../../utils/logger';
import { getOsmProvider } from './osm.provider';
import type { OsmEmergencyFacility, OsmFacility } from './osm.types';

const log = createLogger('osm');

const PILOT_BBOX: [number, number, number, number] = [
  BHOPAL_BBOX.minLng,
  BHOPAL_BBOX.minLat,
  BHOPAL_BBOX.maxLng,
  BHOPAL_BBOX.maxLat,
];

export interface OsmSyncResult {
  provider: string;
  live: boolean;
  fetched: number;
  created: number;
  updated: number;
  skipped: number;
  /** How many rows carry a derived rather than a tagged name. */
  unnamed: number;
  durationMs: number;
  error?: string;
}

export interface OsmFullSyncResult {
  industrial: OsmSyncResult;
  emergency: OsmSyncResult;
}

function parseBbox(value?: string): [number, number, number, number] {
  if (!value?.trim()) return PILOT_BBOX;
  const parts = value.split(',').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) {
    log.warn(`Invalid bbox "${value}"; using the Bhopal pilot bbox`);
    return PILOT_BBOX;
  }
  return parts as [number, number, number, number];
}

/**
 * Pulls industrial facilities from Overpass and upserts them.
 *
 * Upsert keys on `osmId`, so re-running updates existing rows rather than
 * duplicating them, and analyst-created facilities (which have no osmId) are
 * never touched.
 */
export async function syncFacilities(
  options: { bbox?: string; limit?: number } = {},
): Promise<OsmSyncResult> {
  const startedAt = Date.now();
  const provider = getOsmProvider();
  const bbox = parseBbox(options.bbox);

  const result: OsmSyncResult = {
    provider: provider.name,
    live: provider.isLive,
    fetched: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    unnamed: 0,
    durationMs: 0,
  };

  let facilities: OsmFacility[] = [];
  try {
    facilities = await provider.fetchFacilities({ bbox, limit: options.limit });
    result.fetched = facilities.length;
    result.unnamed = facilities.filter((facility) => facility.nameDerived).length;
  } catch (error) {
    // A failing upstream must never take the API down.
    result.error = error instanceof Error ? error.message : 'Unknown Overpass error';
    result.durationMs = Date.now() - startedAt;
    log.error('Industrial facility sync failed', { error: result.error });
    return result;
  }

  for (const facility of facilities) {
    try {
      const existing = await prisma.industrialFacility.findUnique({
        where: { osmId: facility.osmId },
        select: { id: true },
      });

      const data = {
        name: facility.name,
        type: facility.type,
        latitude: facility.latitude,
        longitude: facility.longitude,
        location: facility.location,
        operator: facility.operator,
      };

      if (existing) {
        // riskLevel is deliberately not overwritten: an analyst may have
        // adjusted it, and OSM has no opinion on hazard rating.
        await prisma.industrialFacility.update({ where: { id: existing.id }, data });
        result.updated += 1;
      } else {
        await prisma.industrialFacility.create({
          data: { ...data, osmId: facility.osmId, riskLevel: facility.riskLevel },
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
  log.info('Industrial facility sync complete', result);
  return result;
}

/**
 * Pulls hospitals, fire stations, schools and police posts from Overpass.
 *
 * These drive the impact analysis (who is exposed) and the emergency response
 * panel (what can respond), so they are stored separately from industrial
 * facilities, which represent possible causes rather than resources.
 */
export async function syncEmergencyFacilities(
  options: { bbox?: string; limit?: number } = {},
): Promise<OsmSyncResult> {
  const startedAt = Date.now();
  const provider = getOsmProvider();
  const bbox = parseBbox(options.bbox);

  const result: OsmSyncResult = {
    provider: provider.name,
    live: provider.isLive,
    fetched: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    unnamed: 0,
    durationMs: 0,
  };

  let facilities: OsmEmergencyFacility[] = [];
  try {
    facilities = await provider.fetchEmergencyFacilities({ bbox, limit: options.limit });
    result.fetched = facilities.length;
    result.unnamed = facilities.filter((facility) => facility.nameDerived).length;
  } catch (error) {
    result.error = error instanceof Error ? error.message : 'Unknown Overpass error';
    result.durationMs = Date.now() - startedAt;
    log.error('Emergency facility sync failed', { error: result.error });
    return result;
  }

  const now = new Date();

  for (const facility of facilities) {
    try {
      const data = {
        name: facility.name,
        type: facility.type,
        latitude: facility.latitude,
        longitude: facility.longitude,
        address: facility.address,
        capacity: facility.capacity,
        phone: facility.phone,
        operator: facility.operator,
        ownership: facility.ownership,
        source: 'OpenStreetMap',
        sourceUrl: `https://www.openstreetmap.org/${facility.osmId}`,
        lastVerified: now,
      };

      const existing = await prisma.emergencyFacility.findUnique({
        where: { osmId: facility.osmId },
        select: { id: true },
      });

      if (existing) {
        await prisma.emergencyFacility.update({ where: { id: existing.id }, data });
        result.updated += 1;
      } else {
        await prisma.emergencyFacility.create({ data: { ...data, osmId: facility.osmId } });
        result.created += 1;
      }
    } catch (error) {
      result.skipped += 1;
      log.warn(`Skipped emergency facility ${facility.osmId}`, {
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  result.durationMs = Date.now() - startedAt;
  log.info('Emergency facility sync complete', result);
  return result;
}

/** Runs both syncs. Used by the cron job and the admin trigger endpoint. */
export async function syncAllOsm(options: { bbox?: string; limit?: number } = {}): Promise<OsmFullSyncResult> {
  if (!env.OSM_ENABLED) {
    log.warn('OSM_ENABLED=false — skipping Overpass sync');
    const skipped: OsmSyncResult = {
      provider: 'osm-overpass',
      live: false,
      fetched: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      unnamed: 0,
      durationMs: 0,
      error: 'OSM_ENABLED=false',
    };
    return { industrial: skipped, emergency: skipped };
  }

  const industrial = await syncFacilities(options);
  const emergency = await syncEmergencyFacilities(options);
  return { industrial, emergency };
}
