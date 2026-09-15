import { PILOT } from '../config/bhopal';
import { detectPostgis } from '../config/postgis';
import { disconnectPrisma, prisma } from '../config/prisma';
import {
  checkMlService,
  classify,
  getMlServiceHealth,
  isHighConfidenceIndustrial,
} from '../services/classification.service';
import { findNearestEmergencyFacility } from '../services/emergency.service';
import { createLogger } from '../utils/logger';
import { assessRisk, toEventType } from '../utils/risk';
import { Prisma } from '../generated/prisma/client';

const log = createLogger('script:reclassify');

/**
 * Re-runs classification and risk scoring over every stored hotspot.
 *
 *   npm run ml:reclassify
 *
 * Needed whenever the model is retrained or the thresholds change: the stored
 * class and score are denormalised for query speed, so they do not update
 * themselves. Each pass writes a fresh RiskAssessment row rather than mutating
 * the old one, so the audit trail of what an analyst saw is preserved.
 */
async function main(): Promise<void> {
  const postgis = await detectPostgis();
  if (!postgis.available) {
    log.error('PostGIS unavailable — cannot recompute receptor distances');
    process.exitCode = 1;
    return;
  }

  await checkMlService(true);
  const ml = getMlServiceHealth();
  log.info(
    ml.reachable
      ? `ML service reachable (model ${ml.modelVersion ?? 'unknown'})`
      : `ML service unreachable (${ml.reason ?? 'unknown'}) — rule fallback will be recorded`,
  );

  const hotspots = await prisma.hotspot.findMany({
    select: {
      id: true,
      latitude: true,
      longitude: true,
      detectedAt: true,
      brightnessTemperature: true,
      frp: true,
      confidence: true,
      persistenceDays: true,
      distanceToFacilityM: true,
      dayNight: true,
      industrialFacility: { select: { name: true } },
    },
    orderBy: { detectedAt: 'asc' },
  });

  log.info(`Reclassifying ${hotspots.length} hotspot(s) for ${PILOT.label}`);

  const byClass: Record<string, number> = {};
  const byRisk: Record<string, number> = {};
  let byModel = 0;
  let byRules = 0;
  let changed = 0;
  let highConfidenceIndustrial = 0;

  for (const hotspot of hotspots) {
    const receptor = await findNearestEmergencyFacility(hotspot.latitude, hotspot.longitude);

    const signature = {
      brightnessTemperature: hotspot.brightnessTemperature,
      frp: hotspot.frp,
      confidence: hotspot.confidence,
      persistenceDays: hotspot.persistenceDays,
      distanceToFacilityM: hotspot.distanceToFacilityM,
      facilityName: hotspot.industrialFacility?.name ?? null,
      distanceToReceptorM: receptor?.distanceMeters ?? null,
      receptorName: receptor?.name ?? null,
      dayNight: hotspot.dayNight,
    };

    // recurrenceCount is not stored separately; persistenceDays is the
    // distinct-day count and is what the model was trained on.
    const classification = await classify(signature, hotspot.persistenceDays);
    const risk = assessRisk(signature);

    if (classification.path === 'ML_SERVICE') byModel += 1;
    else byRules += 1;
    if (isHighConfidenceIndustrial(classification)) highConfidenceIndustrial += 1;

    byClass[classification.thermalClass] = (byClass[classification.thermalClass] ?? 0) + 1;
    byRisk[risk.level] = (byRisk[risk.level] ?? 0) + 1;

    const updated = await prisma.hotspot.update({
      where: { id: hotspot.id },
      data: {
        mlClass: classification.thermalClass,
        mlConfidence: classification.confidence,
        classificationPath: classification.path,
        classifiedAt: new Date(),
        modelVersion: classification.modelVersion,
        eventType: toEventType(classification.thermalClass),
        riskScore: risk.score,
        riskLevel: risk.level,
      },
      select: { id: true },
    });
    if (updated) changed += 1;

    await prisma.riskAssessment.create({
      data: {
        hotspotId: hotspot.id,
        score: risk.score,
        level: risk.level,
        reasons: risk.reasons,
        components: risk.components as unknown as Prisma.InputJsonObject,
        weights: risk.weights as unknown as Prisma.InputJsonObject,
        nearestHospitalM: receptor?.type === 'HOSPITAL' ? receptor.distanceMeters : null,
        nearestFireStationM: receptor?.type === 'FIRE_STATION' ? receptor.distanceMeters : null,
      },
    });
  }

  log.info('=== RECLASSIFY SUMMARY (real counts) ===');
  log.info(`  hotspots processed : ${changed}`);
  log.info(`  by model / rules   : ${byModel} / ${byRules}`);
  log.info(`  by class           : ${JSON.stringify(byClass)}`);
  log.info(`  by risk level      : ${JSON.stringify(byRisk)}`);
  log.info(`  high-confidence industrial : ${highConfidenceIndustrial}`);
}

main()
  .catch((error) => {
    log.error('Reclassify failed', { error: error instanceof Error ? error.message : error });
    process.exitCode = 1;
  })
  .finally(() => void disconnectPrisma());
