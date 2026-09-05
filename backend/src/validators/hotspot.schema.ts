import { z } from 'zod';
import { bboxSchema, latitudeSchema, longitudeSchema, paginationSchema, sortOrderSchema } from './common.schema';

export const eventTypeEnum = z.enum([
  'INDUSTRIAL_FIRE',
  'GAS_FLARE',
  'AGRICULTURAL_FIRE',
  'FOREST_FIRE',
  'MINING_ACTIVITY',
  'OTHER',
]);

export const riskLevelEnum = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

export const hotspotSourceEnum = z.enum([
  'VIIRS_SNPP_NRT',
  'VIIRS_NOAA20_NRT',
  'MODIS_NRT',
  'LANDSAT_NRT',
  'MANUAL',
  'MOCK',
]);

/** Accepts a single value or a repeated/comma separated list. */
function multi<T extends z.ZodTypeAny>(schema: T) {
  return z
    .union([schema, z.array(schema), z.string()])
    .optional()
    .transform((value) => {
      if (value === undefined) return undefined;
      if (Array.isArray(value)) return value as z.infer<T>[];
      if (typeof value === 'string' && value.includes(',')) {
        return value.split(',').map((part) => schema.parse(part.trim())) as z.infer<T>[];
      }
      return [schema.parse(value)] as z.infer<T>[];
    });
}

/**
 * Upper bound for a single hotspot page.
 *
 * Higher than the shared default because the map legitimately needs a whole
 * area's detections in one request — paginating a map viewport would draw the
 * layer in visible chunks.
 */
export const MAX_HOTSPOT_PAGE_SIZE = 5000;

export const listHotspotsQuerySchema = paginationSchema.extend({
  pageSize: z.coerce.number().int().min(1).max(MAX_HOTSPOT_PAGE_SIZE).default(25),
  eventType: multi(eventTypeEnum),
  riskLevel: multi(riskLevelEnum),
  source: multi(hotspotSourceEnum),
  minConfidence: z.coerce.number().int().min(0).max(100).optional(),
  minRiskScore: z.coerce.number().min(0).max(100).optional(),
  minPersistenceDays: z.coerce.number().int().min(1).optional(),
  /** Only hotspots that have been detected on PERSISTENT_SOURCE_DAYS or more days. */
  persistentOnly: z.coerce.boolean().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  bbox: bboxSchema.optional(),
  industrialFacilityId: z.string().optional(),
  search: z.string().trim().max(120).optional(),
  sortBy: z.enum(['detectedAt', 'riskScore', 'confidence', 'brightnessTemperature', 'persistenceDays']).default('detectedAt'),
  sortOrder: sortOrderSchema,
});
export type ListHotspotsQuery = z.infer<typeof listHotspotsQuerySchema>;

export const createHotspotSchema = z.object({
  latitude: latitudeSchema,
  longitude: longitudeSchema,
  detectedAt: z.coerce.date().default(() => new Date()),
  confidence: z.coerce.number().int().min(0).max(100),
  brightnessTemperature: z.coerce.number().min(200).max(1200),
  frp: z.coerce.number().min(0).max(100000).optional(),
  persistenceDays: z.coerce.number().int().min(1).max(3650).default(1),
  satellite: z.string().max(40).optional(),
  dayNight: z.enum(['D', 'N']).optional(),
  region: z.string().max(120).optional(),
  source: hotspotSourceEnum.default('MANUAL'),
  externalId: z.string().max(160).optional(),
  industrialFacilityId: z.string().optional(),
  /**
   * Optional overrides. When omitted the server classifies and scores the
   * detection itself via src/utils/risk.ts.
   */
  eventType: eventTypeEnum.optional(),
  riskScore: z.coerce.number().min(0).max(100).optional(),
});
export type CreateHotspotInput = z.infer<typeof createHotspotSchema>;

export const updateHotspotSchema = createHotspotSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'Provide at least one field to update' });
export type UpdateHotspotInput = z.infer<typeof updateHotspotSchema>;
