import { Router } from 'express';
import * as hotspotController from '../controllers/hotspot.controller';
import { requireAuth, requireRole } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { idParamSchema } from '../validators/common.schema';
import {
  createHotspotSchema,
  listHotspotsQuerySchema,
  updateHotspotSchema,
} from '../validators/hotspot.schema';

const router = Router();

// Every hotspot route requires a signed-in user.
router.use(requireAuth);

router.get('/', validate({ query: listHotspotsQuerySchema }), hotspotController.list);
router.get('/recent', hotspotController.recent);
router.get('/:id', validate({ params: idParamSchema }), hotspotController.getById);
router.get(
  '/:id/nearby-facilities',
  validate({ params: idParamSchema }),
  hotspotController.nearbyFacilities,
);

// Writes are restricted to analysts and administrators.
router.post(
  '/',
  requireRole('ADMIN', 'ANALYST'),
  validate({ body: createHotspotSchema }),
  hotspotController.create,
);
router.patch(
  '/:id',
  requireRole('ADMIN', 'ANALYST'),
  validate({ params: idParamSchema, body: updateHotspotSchema }),
  hotspotController.update,
);
router.delete('/:id', requireRole('ADMIN'), validate({ params: idParamSchema }), hotspotController.remove);

export default router;
