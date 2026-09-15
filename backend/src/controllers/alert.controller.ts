import type { Request, Response } from 'express';
import { validated } from '../middleware/validate.middleware';
import * as alertService from '../services/alert.service';
import { asyncHandler } from '../utils/asyncHandler';
import { buildPaginationMeta, sendSuccess } from '../utils/response';
import { ApiError } from '../utils/ApiError';
import type {
  AcknowledgeAlertInput,
  CreateAlertInput,
  ListAlertsQuery,
  UpdateAlertStatusInput,
} from '../validators/alert.schema';
import type { IdParam } from '../validators/common.schema';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const query = validated<ListAlertsQuery>(req, 'query');
  const { items, total, unreadCount } = await alertService.listAlerts(query);
  sendSuccess(res, items, 200, {
    ...buildPaginationMeta(query.page, query.pageSize, total),
    unreadCount,
  });
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = validated<IdParam>(req, 'params');
  sendSuccess(res, await alertService.getAlertById(id));
});

export const markRead = asyncHandler(async (req: Request, res: Response) => {
  const { id } = validated<IdParam>(req, 'params');
  const alert = await alertService.markAlertRead(id, req.user?.id);
  sendSuccess(res, alert);
});

export const markAllRead = asyncHandler(async (req: Request, res: Response) => {
  const count = await alertService.markAllAlertsRead(req.user?.id);
  sendSuccess(res, { updated: count });
});

export const unreadCount = asyncHandler(async (_req: Request, res: Response) => {
  sendSuccess(res, await alertService.getUnreadCount());
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const input = validated<CreateAlertInput>(req, 'body');
  sendSuccess(res, await alertService.createAlert(input), 201);
});

export const recent = asyncHandler(async (_req: Request, res: Response) => {
  sendSuccess(res, await alertService.getRecentAlerts(5));
});

/**
 * PATCH /api/alerts/:id/acknowledge
 *
 * Distinct from markRead: acknowledgement is an auditable triage action
 * asserting that a named analyst has taken ownership, so it requires an
 * identified user and is broadcast to every other open dashboard.
 */
export const acknowledge = asyncHandler(async (req: Request, res: Response) => {
  const { id } = validated<IdParam>(req, 'params');
  const { note } = validated<AcknowledgeAlertInput>(req, 'body');

  if (!req.user) throw ApiError.unauthorized('Acknowledgement requires an authenticated analyst');

  sendSuccess(res, await alertService.acknowledgeAlert(id, req.user.id, note));
});

/** PATCH /api/alerts/:id/status — resolve or dismiss. */
export const updateStatus = asyncHandler(async (req: Request, res: Response) => {
  const { id } = validated<IdParam>(req, 'params');
  const { status, note } = validated<UpdateAlertStatusInput>(req, 'body');

  if (!req.user) throw ApiError.unauthorized('Changing alert status requires an authenticated analyst');

  sendSuccess(res, await alertService.setAlertStatus(id, status, req.user.id, note));
});

/** GET /api/alerts/status-counts — drives the triage filter chips. */
export const statusCounts = asyncHandler(async (_req: Request, res: Response) => {
  sendSuccess(res, await alertService.getStatusCounts());
});
