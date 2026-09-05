import { Router } from 'express';
import * as analyticsController from '../controllers/analytics.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import {
  categoriesQuerySchema,
  summaryQuerySchema,
  trendsQuerySchema,
} from '../validators/analytics.schema';

const router = Router();

router.use(requireAuth);

router.get('/summary', validate({ query: summaryQuerySchema }), analyticsController.summary);
router.get('/trends', validate({ query: trendsQuerySchema }), analyticsController.trends);
router.get('/categories', validate({ query: categoriesQuerySchema }), analyticsController.categories);

export default router;
