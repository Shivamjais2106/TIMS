import { BHOPAL_BBOX_PARAM, PILOT } from '../config/bhopal';
import { detectPostgis } from '../config/postgis';
import { disconnectPrisma, prisma } from '../config/prisma';
import { isFirmsConfigured } from '../services/integrations/firms/firms.provider';
import {
  recomputeBoundaryFlags,
  recomputePersistence,
} from '../services/integrations/firms/firms.service';
import { runIngestCycle } from '../services/ingest.service';
import { checkMlService, getMlServiceHealth } from '../services/classification.service';
import { createLogger } from '../utils/logger';

const log = createLogger('script:ingest');

/**
 * Runs one full ingest cycle from the command line.
 *
 *   npm run firms:ingest                  # NRT first, archive fallback
 *   npm run firms:ingest -- --archive     # force the archive fire-season sweep
 *   npm run firms:ingest -- --day-range=3
 *
 * Reports real counts only. Nothing here fabricates a record.
 */

function parseArgs(): { forceArchive: boolean; dayRange?: number } {
  const args = process.argv.slice(2);
  const dayRangeArg = args.find((arg) => arg.startsWith('--day-range='));
  return {
    forceArchive: args.includes('--archive'),
    dayRange: dayRangeArg ? Number(dayRangeArg.split('=')[1]) : undefined,
  };
}

async function main(): Promise<void> {
  const { forceArchive, dayRange } = parseArgs();

  if (!isFirmsConfigured()) {
    log.error(
      'FIRMS_MAP_KEY is not configured. Request a free key at ' +
        'https://firms.modaps.eosdis.nasa.gov/api/map_key/ and set it in backend/.env. ' +
        'TIMS will not substitute synthetic thermal data.',
    );
    process.exitCode = 1;
    return;
  }

  const postgis = await detectPostgis();
  if (!postgis.available) {
    log.warn(
      'PostGIS is unavailable — distance-to-facility, recurrence and the Bhopal geofence ' +
        'will all be skipped, and classifications will be materially worse. ' +
        'Start the database and apply migrations first.',
    );
  }

  const boundaries = await prisma.administrativeBoundary.count();
  if (boundaries === 0) {
    log.warn('No boundary polygon loaded — run `npm run db:boundary` for a real ST_Within geofence');
  }

  const facilities = await prisma.industrialFacility.count();
  if (facilities === 0) {
    log.warn(
      'No industrial facilities in the database — every distance-to-facility feature will be null ' +
        'and classifications will collapse toward UNKNOWN. Run `npm run osm:sync` first.',
    );
  }

  await checkMlService(true);
  const ml = getMlServiceHealth();
  log.info(
    ml.reachable
      ? `ML service reachable (model ${ml.modelVersion ?? 'unknown'})`
      : `ML service unreachable (${ml.reason ?? 'unknown'}) — the rule-based fallback will be used and recorded as such`,
  );

  log.info(`Starting ingest for ${PILOT.label} (${PILOT.id})`, {
    bbox: BHOPAL_BBOX_PARAM,
    forceArchive,
    dayRange: dayRange ?? '(env default)',
  });

  const result = await runIngestCycle({ forceArchive, dayRange });

  // A single, honest summary block. These are the numbers to quote.
  log.info('=== INGEST SUMMARY (real counts) ===');
  log.info(`  window            : ${result.window.kind} — ${result.window.description}`);
  log.info(`  products          : ${result.window.products.join(', ')}`);
  log.info(`  per-product rows  : ${JSON.stringify(result.perProduct)}`);
  log.info(`  fetched           : ${result.fetched}`);
  log.info(`  outside boundary  : ${result.outsideBoundary}  (rejected by ST_Within)`);
  log.info(`  duplicates        : ${result.duplicates}`);
  log.info(`  created           : ${result.created}`);
  log.info(`  failed            : ${result.failed}`);
  log.info(`  by model / rules  : ${result.classifiedByModel} / ${result.classifiedByRules}`);
  log.info(`  alerts raised     : ${result.alertsRaised}`);
  log.info(`  by class          : ${JSON.stringify(result.byClass)}`);
  log.info(`  by risk level     : ${JSON.stringify(result.byRiskLevel)}`);
  log.info(`  duration          : ${(result.durationMs / 1000).toFixed(1)}s`);

  if (result.errors.length > 0) {
    log.warn(`  upstream errors   : ${result.errors.length}`);
    for (const error of result.errors.slice(0, 10)) log.warn(`    - ${error}`);
  }

  // Persistence is only knowable once later days exist, so recompute after the
  // batch rather than trusting the per-row value written during ingest.
  if (result.created > 0 && postgis.available) {
    // An archive sweep inserts rows spanning years, so every stored hotspot
    // needs revisiting - rows added late change the recurrence counts of rows
    // added early.
    const persistence = await recomputePersistence({ allTime: result.window.kind === 'archive' });
    const boundaryFixed = await recomputeBoundaryFlags();
    log.info(
      `  post-pass         : ${persistence.updated}/${persistence.examined} persistence updated, ` +
        `${boundaryFixed} boundary flag(s) corrected`,
    );
  }

  const totals = await prisma.hotspot.count();
  const inBhopal = await prisma.hotspot.count({ where: { inBhopalBoundary: true } });
  log.info(`  database totals   : ${totals} hotspot(s), ${inBhopal} inside the ${PILOT.label} boundary`);
}

main()
  .catch((error) => {
    log.error('Ingest script failed', { error: error instanceof Error ? error.message : error });
    process.exitCode = 1;
  })
  .finally(() => void disconnectPrisma());
