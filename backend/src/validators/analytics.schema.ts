import { z } from 'zod';

export const trendsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
  interval: z.enum(['day', 'week', 'month']).default('day'),
});
export type TrendsQuery = z.infer<typeof trendsQuerySchema>;

export const summaryQuerySchema = z.object({
  /** Window used for the "vs previous period" deltas on the dashboard tiles. */
  days: z.coerce.number().int().min(1).max(365).default(30),
});
export type SummaryQuery = z.infer<typeof summaryQuerySchema>;

export const categoriesQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});
export type CategoriesQuery = z.infer<typeof categoriesQuerySchema>;
