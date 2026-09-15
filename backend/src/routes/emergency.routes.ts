import { Router } from 'express';
import * as emergencyController from '../controllers/emergency.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

router.use(requireAuth);

router.get('/', emergencyController.list);
router.get('/hospitals', emergencyController.hospitals);
router.get('/fire-stations', emergencyController.fireStations);
router.get('/near', emergencyController.near);
router.get('/response/:hotspotId', emergencyController.responsePlan);

export default router;
