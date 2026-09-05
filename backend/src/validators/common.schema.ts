import { z } from 'zod';

export const idParamSchema = z.object({
  id: z.string().min(1, 'id is required'),
});
export type IdParam = z.infer<typeof idParamSchema>;

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(25),
});

export const latitudeSchema = z.coerce.number().min(-90).max(90);
export const longitudeSchema = z.coerce.number().min(-180).max(180);

/** "minLon,minLat,maxLon,maxLat" — the ordering NASA FIRMS and OGC both use. */
export const bboxSchema = z
  .string()
  .regex(/^-?\d+(\.\d+)?(,-?\d+(\.\d+)?){3}$/, 'bbox must be "minLon,minLat,maxLon,maxLat"')
  .transform((value, ctx) => {
    const [minLon, minLat, maxLon, maxLat] = value.split(',').map(Number) as [number, number, number, number];
    if (minLon >= maxLon || minLat >= maxLat) {
      ctx.addIssue({ code: 'custom', message: 'bbox minimums must be smaller than maximums' });
      return z.NEVER;
    }
    return { minLon, minLat, maxLon, maxLat };
  });

export type BoundingBox = { minLon: number; minLat: number; maxLon: number; maxLat: number };

export const sortOrderSchema = z.enum(['asc', 'desc']).default('desc');
