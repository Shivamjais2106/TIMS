import { prisma } from './prisma';
import { createLogger } from '../utils/logger';

const log = createLogger('postgis');

export interface PostgisStatus {
  available: boolean;
  version: string | null;
  checkedAt: string;
  reason?: string;
}

let cached: PostgisStatus = {
  available: false,
  version: null,
  checkedAt: new Date(0).toISOString(),
  reason: 'Not checked yet',
};

/**
 * Probes the database for PostGIS.
 *
 * The rest of the application deliberately does NOT fall back to an
 * approximate JavaScript Haversine when this returns false: geospatial
 * endpoints respond 503 with an actionable message instead, so a demo never
 * silently presents fake distances.
 */
export async function detectPostgis(): Promise<PostgisStatus> {
  try {
    const rows = await prisma.$queryRaw<Array<{ version: string }>>`SELECT postgis_version() AS version`;
    const version = rows[0]?.version ?? null;
    cached = { available: version !== null, version, checkedAt: new Date().toISOString() };
    log.info(`PostGIS detected (${version})`);
  } catch (error) {
    cached = {
      available: false,
      version: null,
      checkedAt: new Date().toISOString(),
      reason: error instanceof Error ? error.message : 'Unknown error',
    };
    log.warn('PostGIS is not available - geospatial endpoints will return 503', { reason: cached.reason });
  }
  return cached;
}

export function getPostgisStatus(): PostgisStatus {
  return cached;
}
