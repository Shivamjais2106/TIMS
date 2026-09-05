import { z } from 'zod';
import { paginationSchema, sortOrderSchema } from './common.schema';

export const severityEnum = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

export const listAlertsQuerySchema = paginationSchema.extend({
  severity: severityEnum.optional(),
  isRead: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
  hotspotId: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  sortOrder: sortOrderSchema,
});
export type ListAlertsQuery = z.infer<typeof listAlertsQuerySchema>;

export const createAlertSchema = z.object({
  title: z.string().trim().min(3).max(160),
  message: z.string().trim().min(3).max(1000),
  severity: severityEnum.default('MEDIUM'),
  hotspotId: z.string().optional(),
});
export type CreateAlertInput = z.infer<typeof createAlertSchema>;
