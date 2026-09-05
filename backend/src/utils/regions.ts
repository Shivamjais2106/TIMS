/**
 * Coarse region lookup used to label detections for the analytics breakdown.
 *
 * These are deliberately simple bounding boxes, not administrative boundaries.
 * When a real boundary layer is loaded into PostGIS this whole file is replaced
 * by an `ST_Contains` join against that table — the call site only needs a
 * string back.
 */
interface RegionBox {
  name: string;
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

const REGIONS: RegionBox[] = [
  { name: 'Gujarat', minLat: 20.1, maxLat: 24.7, minLon: 68.1, maxLon: 74.5 },
  { name: 'Rajasthan', minLat: 23.0, maxLat: 30.2, minLon: 69.5, maxLon: 78.3 },
  { name: 'Punjab', minLat: 29.5, maxLat: 32.6, minLon: 73.8, maxLon: 76.9 },
  { name: 'Haryana', minLat: 27.6, maxLat: 30.9, minLon: 74.4, maxLon: 77.6 },
  { name: 'Delhi NCR', minLat: 28.3, maxLat: 28.9, minLon: 76.8, maxLon: 77.4 },
  { name: 'Uttar Pradesh', minLat: 23.8, maxLat: 30.4, minLon: 77.0, maxLon: 84.7 },
  { name: 'Madhya Pradesh', minLat: 21.0, maxLat: 26.9, minLon: 74.0, maxLon: 82.8 },
  { name: 'Maharashtra', minLat: 15.6, maxLat: 22.1, minLon: 72.6, maxLon: 80.9 },
  { name: 'Chhattisgarh', minLat: 17.7, maxLat: 24.1, minLon: 80.2, maxLon: 84.4 },
  { name: 'Jharkhand', minLat: 21.9, maxLat: 25.4, minLon: 83.3, maxLon: 87.9 },
  { name: 'Odisha', minLat: 17.8, maxLat: 22.6, minLon: 81.4, maxLon: 87.5 },
  { name: 'West Bengal', minLat: 21.5, maxLat: 27.2, minLon: 85.8, maxLon: 89.9 },
  { name: 'Bihar', minLat: 24.3, maxLat: 27.5, minLon: 83.3, maxLon: 88.3 },
  { name: 'Telangana', minLat: 15.8, maxLat: 19.9, minLon: 77.2, maxLon: 81.3 },
  { name: 'Andhra Pradesh', minLat: 12.6, maxLat: 19.9, minLon: 76.7, maxLon: 84.8 },
  { name: 'Karnataka', minLat: 11.5, maxLat: 18.5, minLon: 74.0, maxLon: 78.6 },
  { name: 'Tamil Nadu', minLat: 8.0, maxLat: 13.6, minLon: 76.2, maxLon: 80.4 },
  { name: 'Kerala', minLat: 8.2, maxLat: 12.8, minLon: 74.8, maxLon: 77.4 },
  { name: 'Assam & North East', minLat: 21.9, maxLat: 29.5, minLon: 88.0, maxLon: 97.5 },
];

/** Best-effort region label for a coordinate. Returns null outside all boxes. */
export function regionForPoint(latitude: number, longitude: number): string | null {
  // Smallest matching box wins, so Delhi NCR beats the Haryana/UP boxes it sits inside.
  let best: RegionBox | null = null;
  let bestArea = Number.POSITIVE_INFINITY;

  for (const region of REGIONS) {
    const inside =
      latitude >= region.minLat &&
      latitude <= region.maxLat &&
      longitude >= region.minLon &&
      longitude <= region.maxLon;
    if (!inside) continue;

    const area = (region.maxLat - region.minLat) * (region.maxLon - region.minLon);
    if (area < bestArea) {
      best = region;
      bestArea = area;
    }
  }

  return best?.name ?? null;
}
