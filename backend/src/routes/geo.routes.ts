import { Router } from 'express';
import * as geoController from '../controllers/geo.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import {
  areaQuerySchema,
  hotspotRadiusQuerySchema,
  nearestFacilityQuerySchema,
  radiusQuerySchema,
} from '../validators/geo.schema';

const router = Router();

// Capability probe is public so an unauthenticated health page can show it.
router.get('/status', geoController.status);

router.use(requireAuth);

router.get('/facilities/near', validate({ query: radiusQuerySchema }), geoController.facilitiesNear);
router.get('/facilities/nearest', validate({ query: nearestFacilityQuerySchema }), geoController.nearestFacility);
router.get('/hotspots/near', validate({ query: hotspotRadiusQuerySchema }), geoController.hotspotsNear);
router.post('/hotspots/in-area', validate({ body: areaQuerySchema }), geoController.hotspotsInArea);

export default router;
