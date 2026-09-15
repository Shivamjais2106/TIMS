import { Router } from 'express';
import { getPostgisStatus } from '../config/postgis';
import { env } from '../config/env';
import { prisma } from '../config/prisma';
import { isFirmsConfigured } from '../services/integrations/firms/firms.provider';
import { getOsmProvider } from '../services/integrations/osm/osm.provider';
import { getMlServiceHealth } from '../services/classification.service';
import { getConnectionCount } from '../realtime';
import { PILOT } from '../config/bhopal';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/response';
import adminRoutes from './admin.routes';
import alertRoutes from './alert.routes';
import bhopalRoutes from './bhopal.routes';
import emergencyRoutes from './emergency.routes';
import reportRoutes from './report.routes';
import analyticsRoutes from './analytics.routes';
import authRoutes from './auth.routes';
import geoRoutes from './geo.routes';
import hotspotRoutes from './hotspot.routes';
import industryRoutes from './industry.routes';

const router = Router();

/**
 * Liveness + capability probe.
 *
 * Deliberately public and deliberately honest: it reports which data providers
 * are actually live so a reviewer can see at a glance whether FIRMS/PostGIS are
 * wired up or running on mocks.
 */
router.get(
  '/health',
  asyncHandler(async (_req, res) => {
    let database = false;
    try {
      await prisma.$queryRaw`SELECT 1`;
      database = true;
    } catch {
      database = false;
    }

    const osm = getOsmProvider();

    sendSuccess(res, {
      status: database ? 'ok' : 'degraded',
      service: 'tims-api',
      pilot: PILOT,
      environment: env.NODE_ENV,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      dependencies: {
        database,
        postgis: getPostgisStatus(),
        // Reported as "configured", not "live": whether NASA actually answers
        // is only knowable by making a request, and this endpoint must not.
        firms: { provider: 'firms-nasa', configured: isFirmsConfigured() },
        osm: { provider: osm.name, enabled: env.OSM_ENABLED },
        mlService: getMlServiceHealth(),
        weather: { imdConfigured: env.imdEnabled, fallbackEnabled: env.WEATHER_FALLBACK_ENABLED },
        bhuvan: { configured: env.bhuvanEnabled },
        cronJobs: env.ENABLE_CRON_JOBS,
        realtimeClients: getConnectionCount(),
        demoMode: env.DEMO_MODE,
      },
    });
  }),
);

router.use('/auth', authRoutes);
router.use('/hotspots', hotspotRoutes);
router.use('/industries', industryRoutes);
router.use('/alerts', alertRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/geo', geoRoutes);
// Manual data-synchronisation triggers live under /admin and are ADMIN-only.
//
// An earlier /api/jobs/trigger-firms route did the same thing with no
// authentication and returned stack traces on failure, so any anonymous caller
// could drive requests to NASA and Overpass on this deployment's behalf. It has
// been removed in favour of the guarded endpoints.
router.use('/admin', adminRoutes);
router.use('/emergency', emergencyRoutes);
router.use('/reports', reportRoutes);

// Pilot scoping, geofence, weather, impact and the transparency register are
// mounted at the API root rather than under a prefix, because the brief
// specifies /api/weather, /api/boundaries/bhopal and /api/datasources.
router.use('/', bhopalRoutes);

export default router;
