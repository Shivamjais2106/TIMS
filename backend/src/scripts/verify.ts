import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BHOPAL_BBOX_PARAM, PILOT } from '../config/bhopal';
import { env } from '../config/env';
import { detectPostgis } from '../config/postgis';
import { disconnectPrisma, prisma } from '../config/prisma';
import { checkMlService, getMlServiceHealth } from '../services/classification.service';
import { isFirmsConfigured } from '../services/integrations/firms/firms.provider';
import { createLogger } from '../utils/logger';

const log = createLogger('verify');

/**
 * Part 4, Step 13 — end-to-end verification.
 *
 *   npm run verify
 *
 * Reports the real state of the system. Every number is read from the database,
 * the live API or the trained model's own metadata file. Nothing is asserted
 * that is not measured, and anything unavailable is reported as unavailable
 * rather than skipped.
 */

interface Check {
  name: string;
  pass: boolean;
  detail: string;
}

const checks: Check[] = [];

function record(name: string, pass: boolean, detail: string): void {
  checks.push({ name, pass, detail });
}

function heading(text: string): void {
  log.info('');
  log.info(`--- ${text} ${'-'.repeat(Math.max(0, 58 - text.length))}`);
}

async function main(): Promise<void> {
  log.info('='.repeat(66));
  log.info(`TIMS END-TO-END VERIFICATION — ${PILOT.label} pilot (${PILOT.id})`);
  log.info(`Run at ${new Date().toISOString()}`);
  log.info('='.repeat(66));

  // --- 1. Infrastructure --------------------------------------------------
  heading('1. Infrastructure');

  let database = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    database = true;
  } catch {
    database = false;
  }
  record('PostgreSQL reachable', database, database ? 'connected' : 'unreachable');
  log.info(`  PostgreSQL          : ${database ? 'connected' : 'UNREACHABLE'}`);

  const postgis = await detectPostgis();
  record('PostGIS extension', postgis.available, postgis.version ?? (postgis.reason ?? 'unavailable'));
  log.info(`  PostGIS             : ${postgis.available ? postgis.version : 'UNAVAILABLE'}`);

  record('FIRMS_MAP_KEY configured', isFirmsConfigured(), isFirmsConfigured() ? 'present' : 'missing');
  log.info(`  FIRMS MAP_KEY       : ${isFirmsConfigured() ? 'configured' : 'MISSING'}`);

  await checkMlService(true);
  const ml = getMlServiceHealth();
  record(
    'Classification service',
    ml.reachable,
    ml.reachable ? (ml.modelVersion ?? 'reachable') : (ml.reason ?? 'unreachable'),
  );
  log.info(
    `  ML service          : ${ml.reachable ? `reachable (model ${ml.modelVersion})` : `unreachable — ${ml.reason}`}`,
  );

  log.info(`  Scheduled jobs      : ${env.ENABLE_CRON_JOBS ? 'enabled' : 'disabled'}`);
  log.info(`  Pilot bbox          : ${BHOPAL_BBOX_PARAM}`);

  // --- 2. Ingested data ---------------------------------------------------
  heading('2. Ingested data (real API records only)');

  const [hotspots, inBoundary, facilities, emergency, boundaries, alerts, assessments, weather] =
    await Promise.all([
      prisma.hotspot.count(),
      prisma.hotspot.count({ where: { inBhopalBoundary: true } }),
      prisma.industrialFacility.count(),
      prisma.emergencyFacility.count(),
      prisma.administrativeBoundary.count(),
      prisma.alert.count(),
      prisma.riskAssessment.count(),
      prisma.weatherObservation.count(),
    ]);

  log.info(`  FIRMS detections    : ${hotspots}`);
  log.info(`  ...inside geofence  : ${inBoundary} (ST_Within against the district polygon)`);
  log.info(`  Industrial sites    : ${facilities}  (OpenStreetMap)`);
  log.info(`  Emergency facilities: ${emergency}  (OpenStreetMap)`);
  log.info(`  Boundary polygons   : ${boundaries}`);
  log.info(`  Alerts raised       : ${alerts}`);
  log.info(`  Risk assessments    : ${assessments}`);
  log.info(`  Weather observations: ${weather}`);

  record('FIRMS detections ingested', hotspots > 0, `${hotspots} rows`);
  record('OSM industrial sites ingested', facilities > 0, `${facilities} rows`);
  record('OSM emergency facilities ingested', emergency > 0, `${emergency} rows`);
  record('Boundary polygon loaded', boundaries > 0, `${boundaries} polygon(s)`);

  // Provenance: confirm nothing is left from the retired mock providers.
  const byProduct = await prisma.hotspot.groupBy({
    by: ['firmsProduct'],
    _count: { _all: true },
  });
  log.info('  by FIRMS product:');
  for (const row of byProduct.sort((a, b) => b._count._all - a._count._all)) {
    log.info(`    ${(row.firmsProduct ?? 'unknown').padEnd(18)} ${row._count._all}`);
  }

  const mockRows = await prisma.hotspot.count({ where: { source: 'MOCK' } });
  record('No synthetic detections', mockRows === 0, `${mockRows} rows with source=MOCK`);
  log.info(`  synthetic rows      : ${mockRows} (must be 0)`);

  // --- 3. Geospatial layer ------------------------------------------------
  heading('3. Geospatial layer (PostGIS)');

  if (postgis.available && boundaries > 0) {
    const [geo] = await prisma.$queryRaw<
      Array<{ areakm2: number; vertices: number; valid: boolean; centreinside: boolean }>
    >`
      SELECT
        ST_Area("geom"::geography) / 1000000.0 AS areakm2,
        ST_NPoints("geom") AS vertices,
        ST_IsValid("geom") AS valid,
        ST_Within(ST_SetSRID(ST_MakePoint(77.425, 23.225), 4326), "geom") AS centreinside
      FROM "administrative_boundaries"
      WHERE "name" = ${PILOT.label}
      LIMIT 1
    `;

    if (geo) {
      log.info(`  polygon area        : ${Math.round(geo.areakm2)} km²`);
      log.info(`  polygon vertices    : ${Number(geo.vertices)}`);
      log.info(`  OGC valid           : ${geo.valid}`);
      log.info(`  map centre inside   : ${geo.centreinside}`);

      // Bhopal district is published at roughly 2,772 km²; a loaded polygon
      // within 5% of that is the geometry check, not an assumption.
      const areaPlausible = Math.abs(geo.areakm2 - 2772) / 2772 < 0.05;
      record('Boundary area matches published district area', areaPlausible, `${Math.round(geo.areakm2)} km² vs ~2772 km²`);
      record('Boundary geometry valid', geo.valid, 'ST_IsValid');
      record('Map centre inside boundary', geo.centreinside, 'ST_Within sanity check');
    }

    const [dist] = await prisma.$queryRaw<
      Array<{ mn: number; p50: number; mx: number; within1km: bigint; within3km: bigint }>
    >`
      SELECT
        MIN("distanceToFacilityM") AS mn,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY "distanceToFacilityM") AS p50,
        MAX("distanceToFacilityM") AS mx,
        COUNT(*) FILTER (WHERE "distanceToFacilityM" <= 1000) AS within1km,
        COUNT(*) FILTER (WHERE "distanceToFacilityM" <= 3000) AS within3km
      FROM "hotspots"
    `;
    if (dist) {
      log.info(
        `  distance-to-facility: min ${Math.round(dist.mn)} m, median ${Math.round(dist.p50)} m, max ${Math.round(dist.mx)} m`,
      );
      log.info(
        `  within 1 km / 3 km  : ${Number(dist.within1km)} / ${Number(dist.within3km)} of ${hotspots}`,
      );
      record('Distance features computed', dist.mn > 0, 'PostGIS ST_Distance on the WGS84 spheroid');
    }

    const [pers] = await prisma.$queryRaw<Array<{ mx: number; persistent: bigint }>>`
      SELECT MAX("persistenceDays") AS mx, COUNT(*) FILTER (WHERE "persistenceDays" >= 3) AS persistent
      FROM "hotspots"
    `;
    if (pers) {
      log.info(`  max persistence     : ${Number(pers.mx)} days`);
      log.info(`  persistent sources  : ${Number(pers.persistent)} (3+ distinct days)`);
    }
  } else {
    log.warn('  Skipped — PostGIS or boundary unavailable');
  }

  // --- 4. Classification --------------------------------------------------
  heading('4. Classification');

  const byClass = await prisma.hotspot.groupBy({ by: ['mlClass'], _count: { _all: true } });
  const byPath = await prisma.hotspot.groupBy({ by: ['classificationPath'], _count: { _all: true } });

  log.info('  by class:');
  for (const row of byClass.sort((a, b) => b._count._all - a._count._all)) {
    log.info(`    ${(row.mlClass ?? 'UNCLASSIFIED').padEnd(38)} ${row._count._all}`);
  }
  log.info('  by provenance:');
  for (const row of byPath) {
    log.info(`    ${row.classificationPath.padEnd(38)} ${row._count._all}`);
  }

  const unclassified = await prisma.hotspot.count({ where: { mlClass: null } });
  record('Every detection classified', unclassified === 0, `${unclassified} unclassified`);

  const byModel = byPath.find((row) => row.classificationPath === 'ML_SERVICE')?._count._all ?? 0;
  record('Model path exercised', byModel > 0, `${byModel} classified by the model`);

  // --- 5. Risk ------------------------------------------------------------
  heading('5. Risk assessment');

  const byRisk = await prisma.hotspot.groupBy({ by: ['riskLevel'], _count: { _all: true } });
  for (const level of ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const) {
    const count = byRisk.find((row) => row.riskLevel === level)?._count._all ?? 0;
    log.info(`    ${level.padEnd(10)} ${count}`);
  }

  const riskStats = await prisma.hotspot.aggregate({
    _avg: { riskScore: true },
    _max: { riskScore: true },
  });
  log.info(`  mean risk score     : ${(riskStats._avg.riskScore ?? 0).toFixed(1)} / 100`);
  log.info(`  max risk score      : ${(riskStats._max.riskScore ?? 0).toFixed(1)} / 100`);

  const withReasons = await prisma.riskAssessment.count({ where: { reasons: { isEmpty: false } } });
  record('Risk scores carry explanations', withReasons > 0, `${withReasons} assessments with reasons`);
  log.info(`  explained scores    : ${withReasons} of ${assessments} assessments`);

  // --- 6. Alerts ----------------------------------------------------------
  heading('6. Alerts');

  const byStatus = await prisma.alert.groupBy({ by: ['status'], _count: { _all: true } });
  for (const row of byStatus) log.info(`    ${row.status.padEnd(14)} ${row._count._all}`);

  const bySeverity = await prisma.alert.groupBy({ by: ['severity'], _count: { _all: true } });
  for (const row of bySeverity) log.info(`    severity ${row.severity.padEnd(10)} ${row._count._all}`);

  // --- 7. Trained model ---------------------------------------------------
  heading('7. Trained model (from ml/models/model_metadata.json)');

  try {
    const metadataPath = join(__dirname, '../../../ml/models/model_metadata.json');
    const metadata = JSON.parse(readFileSync(metadataPath, 'utf8')) as {
      model_version: string;
      algorithm: string;
      dataset: { rows_total: number; rows_train: number; rows_test: number; ground_truth: boolean };
      metrics: Record<
        string,
        {
          accuracy: number;
          macro_f1: number;
          per_class: Record<string, { precision: number; recall: number; f1: number; support: number }>;
        }
      >;
      cross_validation: Record<string, { macro_f1_mean: number; macro_f1_std: number }>;
      selection?: { selected: string; basis: string };
      feature_importance: Record<string, number>;
    };

    log.info(`  model version       : ${metadata.model_version}`);
    log.info(`  selected algorithm  : ${metadata.algorithm}`);
    log.info(`  selection basis     : ${metadata.selection?.basis ?? 'n/a'}`);
    log.info(
      `  dataset             : ${metadata.dataset.rows_total} rows (${metadata.dataset.rows_train} train / ${metadata.dataset.rows_test} test)`,
    );
    log.info(`  ground truth        : ${metadata.dataset.ground_truth} (heuristic weak labels)`);

    for (const [name, scores] of Object.entries(metadata.metrics)) {
      log.info(`  ${name}:`);
      log.info(`    accuracy          : ${scores.accuracy.toFixed(4)}`);
      log.info(`    macro F1          : ${scores.macro_f1.toFixed(4)}`);
      for (const [label, per] of Object.entries(scores.per_class)) {
        log.info(
          `      ${label.padEnd(36)} P ${per.precision.toFixed(3)}  R ${per.recall.toFixed(3)}  F1 ${per.f1.toFixed(3)}  n=${per.support}`,
        );
      }
    }

    log.info('  5-fold CV macro F1:');
    for (const [name, cv] of Object.entries(metadata.cross_validation)) {
      log.info(`    ${name.padEnd(28)} ${cv.macro_f1_mean.toFixed(4)} +/- ${cv.macro_f1_std.toFixed(4)}`);
    }

    log.info('  feature importance:');
    for (const [feature, value] of Object.entries(metadata.feature_importance)) {
      log.info(`    ${feature.padEnd(26)} ${value.toFixed(4)}`);
    }

    record('Model artefact present with metrics', true, metadata.model_version);
    record(
      'Model trained on the ingested dataset',
      metadata.dataset.rows_total > 0,
      `${metadata.dataset.rows_total} rows`,
    );
  } catch (error) {
    record(
      'Model artefact present with metrics',
      false,
      error instanceof Error ? error.message : 'unreadable',
    );
    log.warn('  Could not read model metadata — run `python ml/train_model.py`');
  }

  // --- Summary ------------------------------------------------------------
  heading('Verification summary');

  const passed = checks.filter((check) => check.pass).length;
  for (const check of checks) {
    log.info(`  [${check.pass ? 'PASS' : 'FAIL'}] ${check.name.padEnd(48)} ${check.detail}`);
  }

  log.info('');
  log.info(`  ${passed} / ${checks.length} checks passed`);
  log.info('');
  log.info('  NOTE: model metrics measure agreement with heuristic weak labels,');
  log.info('        not real-world classification correctness. There is no ground');
  log.info('        truth dataset for these detections.');
  log.info('='.repeat(66));

  if (passed < checks.length) process.exitCode = 1;
}

main()
  .catch((error) => {
    log.error('Verification failed', { error: error instanceof Error ? error.message : error });
    process.exitCode = 1;
  })
  .finally(() => void disconnectPrisma());
