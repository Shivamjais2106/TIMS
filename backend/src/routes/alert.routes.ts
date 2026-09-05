import { Router } from 'express';
import * as alertController from '../controllers/alert.controller';
import { requireAuth, requireRole } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { createAlertSchema, listAlertsQuerySchema } from '../validators/alert.schema';
import { idParamSchema } from '../validators/common.schema';

const router = Router();

router.use(requireAuth);

router.get('/', validate({ query: listAlertsQuerySchema }), alertController.list);
router.get('/recent', alertController.recent);
router.get('/unread-count', alertController.unreadCount);
router.get('/:id', validate({ params: idParamSchema }), alertController.getById);

router.patch('/:id/read', validate({ params: idParamSchema }), alertController.markRead);
router.patch('/read-all', alertController.markAllRead);

router.post(
  '/',
  requireRole('ADMIN', 'ANALYST'),
  validate({ body: createAlertSchema }),
  alertController.create,
);

export default router;
