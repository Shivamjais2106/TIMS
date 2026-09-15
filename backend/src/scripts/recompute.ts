import { detectPostgis } from '../config/postgis';
import { disconnectPrisma } from '../config/prisma';
import {
  recomputeBoundaryFlags,
  recomputePersistence,
} from '../services/integrations/firms/firms.service';
import { createLogger } from '../utils/logger';

const log = createLogger('script:recompute');

/**
 * Recomputes derived spatial fields without re-fetching from NASA.
 *
 *   npm run db:recompute            # trailing 30-day window
 *   npm run db:recompute -- --all   # every stored hotspot
 */
async function main(): Promise<void> {
  const allTime = process.argv.includes('--all');

  const postgis = await detectPostgis();
  if (!postgis.available) {
    log.error('PostGIS unavailable');
    process.exitCode = 1;
    return;
  }

  const started = Date.now();
  const persistence = await recomputePersistence({ allTime });
  const boundary = await recomputeBoundaryFlags();

  log.info('Recompute complete', {
    scope: allTime ? 'all-time' : 'trailing window',
    persistenceExamined: persistence.examined,
    persistenceUpdated: persistence.updated,
    boundaryFlagsCorrected: boundary,
    durationMs: Date.now() - started,
  });
}

main()
  .catch((error) => {
    log.error('Recompute failed', { error: error instanceof Error ? error.message : error });
    process.exitCode = 1;
  })
  .finally(() => void disconnectPrisma());
