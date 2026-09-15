import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { deleteReport, generateReport, getReport, listReports } from '../services/report.service';
import { idParamSchema } from '../validators/common.schema';
import { asyncHandler } from '../utils/asyncHandler';
import { buildPaginationMeta, sendSuccess } from '../utils/response';

const router = Router();

const generateSchema = z.object({
  kind: z.enum(['incident', 'daily', 'weekly', 'custom']),
  title: z.string().trim().min(3).max(160).optional(),
  periodStart: z.coerce.date().optional(),
  periodEnd: z.coerce.date().optional(),
  hotspotId: z.string().optional(),
});

router.use(requireAuth);

router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const page = Math.max(1, Number(req.query['page'] ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(req.query['pageSize'] ?? 25)));
    const { items, total } = await listReports(page, pageSize);
    // Bare array in `data`, pagination in `meta` — see emergency.controller.
    sendSuccess(res, items, 200, { ...buildPaginationMeta(page, pageSize, total) });
  }),
);

router.get(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    sendSuccess(res, await getReport(req.params['id'] as string));
  }),
);

// Generating a report writes a row, so it needs at least analyst rights.
router.post(
  '/',
  requireRole('ADMIN', 'ANALYST'),
  validate({ body: generateSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const report = await generateReport(req.body, req.user?.id);
    sendSuccess(res, report, 201);
  }),
);

router.delete(
  '/:id',
  requireRole('ADMIN'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    await deleteReport(req.params['id'] as string);
    res.status(204).send();
  }),
);

export default router;
