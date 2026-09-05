import { z } from 'zod';
import { latitudeSchema, longitudeSchema } from './common.schema';
import { eventTypeEnum, riskLevelEnum } from './hotspot.schema';

export const radiusQuerySchema = z.object({
  lat: latitudeSchema,
  lng: longitudeSchema,
  /** Search radius in kilometres. Capped so a stray request cannot scan the planet. */
  radiusKm: z.coerce.number().positive().max(1000).default(25),
  limit: z.coerce.number().int().min(1).max(500).default(50),
});
export type RadiusQuery = z.infer<typeof radiusQuerySchema>;

export const hotspotRadiusQuerySchema = radiusQuerySchema.extend({
  eventType: eventTypeEnum.optional(),
  riskLevel: riskLevelEnum.optional(),
  from: z.coerce.date().optional(),
});
export type HotspotRadiusQuery = z.infer<typeof hotspotRadiusQuerySchema>;

const positionSchema = z.tuple([longitudeSchema, latitudeSchema]);

/** A GeoJSON Polygon, as produced by Leaflet Draw or any standard GIS export. */
export const polygonSchema = z.object({
  type: z.literal('Polygon'),
  coordinates: z
    .array(z.array(positionSchema).min(4, 'A linear ring needs at least 4 positions'))
    .min(1, 'A polygon needs at least an outer ring'),
});

export const areaQuerySchema = z.object({
  polygon: polygonSchema,
  limit: z.coerce.number().int().min(1).max(2000).default(500),
});
export type AreaQuery = z.infer<typeof areaQuerySchema>;

export const nearestFacilityQuerySchema = z.object({
  lat: latitudeSchema,
  lng: longitudeSchema,
  maxDistanceKm: z.coerce.number().positive().max(500).default(50),
});
export type NearestFacilityQuery = z.infer<typeof nearestFacilityQuerySchema>;
