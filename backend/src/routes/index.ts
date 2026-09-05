import { Router } from 'express';
import { getPostgisStatus } from '../config/postgis';
import { env } from '../config/env';
import { prisma } from '../config/prisma';
import { getFirmsProvider } from '../services/integrations/firms/firms.provider';
import { getOsmProvider } from '../services/integrations/osm/osm.provider';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/response';
import alertRoutes from './alert.routes';
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

    const firms = getFirmsProvider();
    const osm = getOsmProvider();

    sendSuccess(res, {
      status: database ? 'ok' : 'degraded',
      service: 'tims-api',
      environment: env.NODE_ENV,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      dependencies: {
        database,
        postgis: getPostgisStatus(),
        firms: { provider: firms.name, live: firms.isLive },
        osm: { provider: osm.name, live: osm.isLive },
        cronJobs: env.ENABLE_CRON_JOBS,
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

export default router;
