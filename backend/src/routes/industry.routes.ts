import { Router } from 'express';
import * as industryController from '../controllers/industry.controller';
import { requireAuth, requireRole } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { idParamSchema } from '../validators/common.schema';
import {
  createIndustrySchema,
  listIndustriesQuerySchema,
  updateIndustrySchema,
} from '../validators/industry.schema';

const router = Router();

router.use(requireAuth);

router.get('/', validate({ query: listIndustriesQuerySchema }), industryController.list);
router.get('/summary', industryController.summary);
router.get('/:id', validate({ params: idParamSchema }), industryController.getById);

router.post(
  '/',
  requireRole('ADMIN', 'ANALYST'),
  validate({ body: createIndustrySchema }),
  industryController.create,
);
router.patch(
  '/:id',
  requireRole('ADMIN', 'ANALYST'),
  validate({ params: idParamSchema, body: updateIndustrySchema }),
  industryController.update,
);
router.delete('/:id', requireRole('ADMIN'), validate({ params: idParamSchema }), industryController.remove);

export default router;
