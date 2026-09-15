import { BHOPAL_BBOX_PARAM, PILOT } from '../config/bhopal';
import { disconnectPrisma, prisma } from '../config/prisma';
import { syncAllOsm } from '../services/integrations/osm/osm.service';
import { createLogger } from '../utils/logger';

const log = createLogger('script:osm');

/**
 * Pulls real industrial and emergency facility geometry from OpenStreetMap.
 *
 *   npm run osm:sync
 *
 * Reports real counts only.
 */
async function main(): Promise<void> {
  log.info(`Syncing OpenStreetMap facilities for ${PILOT.label}`, { bbox: BHOPAL_BBOX_PARAM });

  const { industrial, emergency } = await syncAllOsm();

  log.info('=== OSM SYNC SUMMARY (real counts) ===');
  for (const [label, result] of [['industrial', industrial], ['emergency', emergency]] as const) {
    log.info(`  ${label}:`);
    log.info(`    fetched : ${result.fetched}`);
    log.info(`    created : ${result.created}`);
    log.info(`    updated : ${result.updated}`);
    log.info(`    skipped : ${result.skipped}`);
    log.info(`    unnamed : ${result.unnamed}  (derived label, kept for spatial features)`);
    log.info(`    took    : ${(result.durationMs / 1000).toFixed(1)}s`);
    if (result.error) log.warn(`    error   : ${result.error}`);
  }

  const byType = await prisma.emergencyFacility.groupBy({ by: ['type'], _count: { _all: true } });
  const industrialByType = await prisma.industrialFacility.groupBy({ by: ['type'], _count: { _all: true } });

  log.info('  database totals:');
  log.info(`    industrial_facilities : ${await prisma.industrialFacility.count()}`);
  for (const row of industrialByType.sort((a, b) => b._count._all - a._count._all)) {
    log.info(`      ${row.type.padEnd(16)} ${row._count._all}`);
  }
  log.info(`    emergency_facilities  : ${await prisma.emergencyFacility.count()}`);
  for (const row of byType.sort((a, b) => b._count._all - a._count._all)) {
    log.info(`      ${row.type.padEnd(16)} ${row._count._all}`);
  }
}

main()
  .catch((error) => {
    log.error('OSM sync script failed', { error: error instanceof Error ? error.message : error });
    process.exitCode = 1;
  })
  .finally(() => void disconnectPrisma());
