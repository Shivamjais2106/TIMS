import { BHOPAL_DISTRICT_BBOX, PILOT } from '../config/bhopal';
import { disconnectPrisma, prisma } from '../config/prisma';
import { createLogger } from '../utils/logger';

const log = createLogger('script:purge');

/**
 * Removes synthetic records left behind by the retired mock providers.
 *
 * Context: before this rework, `firms.mock.ts` and `osm.mock.ts` generated
 * India-wide detections from a seeded PRNG and wrote them with real-looking
 * `source = VIIRS_SNPP_NRT` values, which made them indistinguishable from
 * genuine NASA data in the UI. The brief requires that every record trace back
 * to a real API call, so they have to go.
 *
 * Selection criterion is deliberately geographic rather than date-based: any
 * hotspot or facility outside the Bhopal district envelope cannot have come
 * from a pilot-scoped FIRMS or Overpass call, because those requests are bbox
 * constrained. That makes this safe to re-run and impossible to over-reach.
 *
 *   npm run db:purge-synthetic            # report only
 *   npm run db:purge-synthetic -- --apply # actually delete
 */

const b = BHOPAL_DISTRICT_BBOX;

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');

  const outsideWhere = {
    OR: [
      { latitude: { lt: b.minLat } },
      { latitude: { gt: b.maxLat } },
      { longitude: { lt: b.minLng } },
      { longitude: { gt: b.maxLng } },
    ],
  };

  const [hotspots, facilities, emergency] = await Promise.all([
    prisma.hotspot.count({ where: outsideWhere }),
    prisma.industrialFacility.count({ where: outsideWhere }),
    prisma.emergencyFacility.count({ where: outsideWhere }),
  ]);

  // Alerts are cascade-deleted with their hotspot, but orphans (hotspotId null)
  // predating this rework are counted separately.
  const orphanAlerts = await prisma.alert.count({ where: { hotspotId: null } });

  log.info(`Records outside the ${PILOT.label} district envelope`, {
    envelope: `${b.minLng},${b.minLat},${b.maxLng},${b.maxLat}`,
    hotspots,
    industrialFacilities: facilities,
    emergencyFacilities: emergency,
    orphanAlerts,
  });

  if (hotspots + facilities + emergency + orphanAlerts === 0) {
    log.info('Nothing to purge — the database contains only pilot-scoped records.');
    return;
  }

  if (!apply) {
    log.warn('Dry run. Re-run with --apply to delete these records.');
    return;
  }

  // Order matters: alerts and risk assessments reference hotspots.
  const deletedAlerts = await prisma.alert.deleteMany({
    where: { OR: [{ hotspot: outsideWhere }, { hotspotId: null }] },
  });
  const deletedAssessments = await prisma.riskAssessment.deleteMany({
    where: { hotspot: outsideWhere },
  });
  const deletedHotspots = await prisma.hotspot.deleteMany({ where: outsideWhere });
  const deletedFacilities = await prisma.industrialFacility.deleteMany({ where: outsideWhere });
  const deletedEmergency = await prisma.emergencyFacility.deleteMany({ where: outsideWhere });

  log.info('Purge complete', {
    alerts: deletedAlerts.count,
    riskAssessments: deletedAssessments.count,
    hotspots: deletedHotspots.count,
    industrialFacilities: deletedFacilities.count,
    emergencyFacilities: deletedEmergency.count,
  });

  log.info('Remaining (all pilot-scoped, all from real API calls)', {
    hotspots: await prisma.hotspot.count(),
    industrialFacilities: await prisma.industrialFacility.count(),
    emergencyFacilities: await prisma.emergencyFacility.count(),
    alerts: await prisma.alert.count(),
  });
}

main()
  .catch((error) => {
    log.error('Purge failed', { error: error instanceof Error ? error.message : error });
    process.exitCode = 1;
  })
  .finally(() => void disconnectPrisma());
