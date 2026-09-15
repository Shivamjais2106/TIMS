import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { BHOPAL_BBOX_PARAM, PILOT } from '../config/bhopal';
import { requireAuth, requireRole } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { isFirmsConfigured } from '../services/integrations/firms/firms.provider';
import {
  recomputeBoundaryFlags,
  recomputePersistence,
} from '../services/integrations/firms/firms.service';
import { syncAllOsm } from '../services/integrations/osm/osm.service';
import { runIngestCycle } from '../services/ingest.service';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/response';

const router = Router();

/**
 * Manual data-synchronisation triggers.
 *
 * ADMIN only, per the brief: these call rate-limited third-party APIs and
 * mutate the database, so an analyst or viewer must not be able to fire them.
 */
router.use(requireAuth, requireRole('ADMIN'));

const firmsSyncSchema = z.object({
  /** Skip the live NRT attempt and sweep the archive fire seasons directly. */
  forceArchive: z.boolean().optional(),
  dayRange: z.coerce.number().int().min(1).max(5).optional(),
  bbox: z.string().optional(),
});

/** POST /api/admin/sync/firms */
router.post(
  '/sync/firms',
  validate({ body: firmsSyncSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    if (!isFirmsConfigured()) {
      throw ApiError.serviceUnavailable(
        'FIRMS_MAP_KEY is not configured. TIMS will not substitute synthetic thermal data. ' +
          'Request a free key at https://firms.modaps.eosdis.nasa.gov/api/map_key/',
      );
    }

    const result = await runIngestCycle(req.body);

    sendSuccess(res, {
      ...result,
      pilot: PILOT.id,
      bbox: BHOPAL_BBOX_PARAM,
      triggeredBy: req.user?.email,
    });
  }),
);

/** POST /api/admin/sync/osm */
router.post(
  '/sync/osm',
  asyncHandler(async (req: Request, res: Response) => {
    const result = await syncAllOsm();
    sendSuccess(res, { ...result, triggeredBy: req.user?.email });
  }),
);

/** POST /api/admin/recompute — persistence and geofence, no upstream calls. */
router.post(
  '/recompute',
  validate({ body: z.object({ allTime: z.boolean().optional() }) }),
  asyncHandler(async (req: Request, res: Response) => {
    const persistence = await recomputePersistence({ allTime: req.body?.allTime === true });
    const boundaryFlags = await recomputeBoundaryFlags();
    sendSuccess(res, { persistence, boundaryFlags, triggeredBy: req.user?.email });
  }),
);

export default router;
