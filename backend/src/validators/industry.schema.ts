import { z } from 'zod';
import { latitudeSchema, longitudeSchema, paginationSchema, sortOrderSchema } from './common.schema';
import { riskLevelEnum } from './hotspot.schema';

export const facilityTypeEnum = z.enum([
  'REFINERY',
  'PETROCHEMICAL',
  'POWER_PLANT',
  'STEEL',
  'MINING',
  'LNG_TERMINAL',
  'OTHER',
]);

export const listIndustriesQuerySchema = paginationSchema.extend({
  type: facilityTypeEnum.optional(),
  riskLevel: riskLevelEnum.optional(),
  search: z.string().trim().max(120).optional(),
  sortBy: z.enum(['name', 'createdAt', 'riskLevel', 'type']).default('name'),
  sortOrder: sortOrderSchema.default('asc'),
  /** When true the response includes an aggregate hotspot count per facility. */
  withHotspotCount: z.coerce.boolean().default(false),
});
export type ListIndustriesQuery = z.infer<typeof listIndustriesQuerySchema>;

export const createIndustrySchema = z.object({
  name: z.string().trim().min(2).max(160),
  type: facilityTypeEnum.default('OTHER'),
  latitude: latitudeSchema,
  longitude: longitudeSchema,
  location: z.string().trim().min(2).max(160),
  riskLevel: riskLevelEnum.default('MEDIUM'),
  operator: z.string().trim().max(160).optional(),
  osmId: z.string().trim().max(80).optional(),
});
export type CreateIndustryInput = z.infer<typeof createIndustrySchema>;

export const updateIndustrySchema = createIndustrySchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'Provide at least one field to update' });
export type UpdateIndustryInput = z.infer<typeof updateIndustrySchema>;
