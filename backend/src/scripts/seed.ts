import { detectPostgis, getPostgisStatus } from '../config/postgis';
import { disconnectPrisma, prisma } from '../config/prisma';
import { MockFirmsProvider } from '../services/integrations/firms/firms.mock';
import { ingestDetections, recomputePersistence } from '../services/integrations/firms/firms.service';
import { syncFacilities } from '../services/integrations/osm/osm.service';
import { createLogger } from '../utils/logger';
import { hashPassword } from '../utils/password';

const log = createLogger('seed');

/** How much history to synthesise. 45 days gives the trend chart real shape. */
const HISTORY_DAYS = 45;
const INDIA_BBOX: [number, number, number, number] = [68.0, 6.0, 98.0, 38.0];

const DEMO_USERS = [
  {
    name: 'TIMS Administrator',
    email: 'admin@tims.gov.in',
    password: 'Admin@1234',
    role: 'ADMIN' as const,
  },
  {
    name: 'Priya Nair',
    email: 'analyst@tims.gov.in',
    password: 'Analyst@1234',
    role: 'ANALYST' as const,
  },
  {
    name: 'Field Viewer',
    email: 'viewer@tims.gov.in',
    password: 'Viewer@1234',
    role: 'VIEWER' as const,
  },
];

async function seedUsers(): Promise<void> {
  for (const user of DEMO_USERS) {
    const passwordHash = await hashPassword(user.password);
    await prisma.user.upsert({
      where: { email: user.email },
      update: { name: user.name, role: user.role },
      create: { name: user.name, email: user.email, passwordHash, role: user.role },
    });
  }
  log.info(`Seeded ${DEMO_USERS.length} demo users`);
}

/**
 * Seeds the database.
 *
 * Data flows through exactly the same pipeline the cron job uses:
 *
 *   OSM provider   -> syncFacilities()   -> industrial_facilities
 *   FIRMS provider -> ingestDetections() -> hotspots (+ classification, risk,
 *                                           facility linking, alerts)
 *
 * So there is no separate "fake data" code path to delete later — pointing the
 * providers at real NASA FIRMS and Overpass is the only change required.
 */
async function main(): Promise<void> {
  log.info('Seeding TIMS database');

  await detectPostgis();
  if (!getPostgisStatus().available) {
    log.warn(
      'PostGIS is not enabled. Facilities and hotspots will still be seeded, but hotspots ' +
        'will not be linked to nearby facilities and geospatial endpoints will return 503. ' +
        'Run "npx prisma migrate deploy" against a PostGIS-enabled database to fix this.',
    );
  }

  // A seed must be re-runnable. Order matters: alerts reference hotspots,
  // hotspots reference facilities.
  await prisma.alert.deleteMany();
  await prisma.hotspot.deleteMany();
  await prisma.industrialFacility.deleteMany();
  log.info('Cleared existing hotspots, alerts and facilities');

  await seedUsers();

  const facilitySync = await syncFacilities({ bbox: INDIA_BBOX.join(','), limit: 500 });
  log.info(`Seeded ${facilitySync.created} industrial facilities from provider "${facilitySync.provider}"`);

  const firms = new MockFirmsProvider();
  const detections = firms.generate(
    { bbox: INDIA_BBOX, dayRange: HISTORY_DAYS, source: 'VIIRS_SNPP_NRT' },
    HISTORY_DAYS,
  );
  log.info(`Generated ${detections.length} synthetic FIRMS detections over ${HISTORY_DAYS} days`);

  const ingest = await ingestDetections(detections);
  log.info(
    `Ingested ${ingest.created} hotspots (${ingest.duplicates} duplicates, ${ingest.failed} failed), ` +
      `${ingest.alertsRaised} alerts raised`,
  );

  // Persistence is only knowable once the whole history exists.
  const persistence = await recomputePersistence();
  log.info(`Re-scored ${persistence.updated} hotspots after persistence recompute`);

  // Leave a couple of alerts read so the alerts page shows both states.
  const readable = await prisma.alert.findMany({ orderBy: { createdAt: 'asc' }, take: 3, select: { id: true } });
  if (readable.length > 0) {
    await prisma.alert.updateMany({
      where: { id: { in: readable.map((alert) => alert.id) } },
      data: { isRead: true, acknowledgedAt: new Date() },
    });
  }

  const [hotspots, facilities, alerts, users] = await Promise.all([
    prisma.hotspot.count(),
    prisma.industrialFacility.count(),
    prisma.alert.count(),
    prisma.user.count(),
  ]);

  log.info('Seed complete');
  log.info(`  users:      ${users}`);
  log.info(`  facilities: ${facilities}`);
  log.info(`  hotspots:   ${hotspots}`);
  log.info(`  alerts:     ${alerts}`);
  log.info('');
  log.info('Demo credentials:');
  for (const user of DEMO_USERS) {
    log.info(`  ${user.role.padEnd(7)} ${user.email} / ${user.password}`);
  }
}

main()
  .catch((error: unknown) => {
    log.error('Seed failed', { error: error instanceof Error ? error.stack : error });
    process.exitCode = 1;
  })
  .finally(() => disconnectPrisma());
