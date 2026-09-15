import { Router } from 'express';
import * as bhopalController from '../controllers/bhopal.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

/**
 * Pilot scoping, the boundary polygon and the data-source register are public.
 *
 * They contain no operational detail — only which area TIMS covers and which
 * upstream sources it uses — and the transparency page must be readable by a
 * reviewer who has not been given an account.
 */
router.get('/config', bhopalController.config);
router.get('/boundaries/bhopal', bhopalController.boundary);
router.get('/datasources', bhopalController.dataSources);

router.get('/weather', requireAuth, bhopalController.weather);
router.get('/impact/:hotspotId', requireAuth, bhopalController.impact);
router.get('/emergency-summary', requireAuth, bhopalController.emergencySummary);

export default router;
