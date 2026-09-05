import { env } from '../../../config/env';
import type { FacilityType, RiskLevel } from '../../../generated/prisma/enums';
import { createLogger } from '../../../utils/logger';
import type { OsmFacility, OsmFetchParams, OsmProvider } from './osm.types';

const log = createLogger('osm:overpass');

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements: OverpassElement[];
}

/**
 * Maps OSM tagging onto our FacilityType enum.
 *
 * OSM tags industrial sites inconsistently, so the order here matters: the most
 * specific tag combination is checked first.
 */
function classifyFacility(tags: Record<string, string>): FacilityType {
  const industrial = tags['industrial'] ?? '';
  const manMade = tags['man_made'] ?? '';
  const power = tags['power'] ?? '';
  const product = tags['product'] ?? '';
  const landuse = tags['landuse'] ?? '';

  if (industrial === 'oil' || manMade === 'petroleum_well' || tags['refinery'] !== undefined) return 'REFINERY';
  if (industrial === 'refinery') return 'REFINERY';
  if (industrial === 'chemical' || industrial === 'petrochemical') return 'PETROCHEMICAL';
  if (power === 'plant' || manMade === 'works' && product.includes('electricity')) return 'POWER_PLANT';
  if (product.includes('lng') || tags['pipeline'] === 'lng') return 'LNG_TERMINAL';
  if (industrial === 'steel' || product.includes('steel')) return 'STEEL';
  if (landuse === 'quarry' || industrial === 'mine' || manMade === 'mineshaft') return 'MINING';
  return 'OTHER';
}

/** Default hazard rating by facility class, refined later by observed activity. */
function defaultRiskLevel(type: FacilityType): RiskLevel {
  switch (type) {
    case 'REFINERY':
    case 'PETROCHEMICAL':
    case 'LNG_TERMINAL':
      return 'HIGH';
    case 'STEEL':
    case 'POWER_PLANT':
    case 'MINING':
      return 'MEDIUM';
    default:
      return 'LOW';
  }
}

function buildQuery(bbox: [number, number, number, number], limit: number): string {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  // Overpass expects south,west,north,east.
  const area = `${minLat},${minLon},${maxLat},${maxLon}`;

  return `
    [out:json][timeout:120];
    (
      nwr["industrial"~"oil|refinery|chemical|petrochemical|steel|mine"](${area});
      nwr["man_made"="works"](${area});
      nwr["power"="plant"](${area});
      nwr["landuse"="quarry"](${area});
    );
    out center ${limit};
  `.trim();
}

/**
 * Live OpenStreetMap provider backed by the Overpass API.
 *
 * Gated behind OSM_ENABLED because Overpass rate-limits aggressively and a
 * country-scale query can take minutes — not something a dev server should do
 * on every boot.
 */
export class OverpassOsmProvider implements OsmProvider {
  readonly name = 'osm-overpass';
  readonly isLive = true;

  async fetchFacilities(params: OsmFetchParams): Promise<OsmFacility[]> {
    const limit = params.limit ?? 500;
    const query = buildQuery(params.bbox, limit);

    log.info('Querying Overpass', { bbox: params.bbox, limit });

    const response = await fetch(env.OSM_OVERPASS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ data: query }).toString(),
      signal: AbortSignal.timeout(120_000),
    });

    if (!response.ok) {
      throw new Error(`Overpass responded ${response.status} ${response.statusText}`);
    }

    const payload = (await response.json()) as OverpassResponse;

    return payload.elements
      .map((element) => this.toFacility(element))
      .filter((facility): facility is OsmFacility => facility !== null);
  }

  private toFacility(element: OverpassElement): OsmFacility | null {
    const tags = element.tags ?? {};
    const latitude = element.lat ?? element.center?.lat;
    const longitude = element.lon ?? element.center?.lon;
    const name = tags['name'] ?? tags['operator'];

    // Unnamed or geometry-less elements are noise for an operations dashboard.
    if (latitude === undefined || longitude === undefined || !name) return null;

    const type = classifyFacility(tags);

    return {
      osmId: `${element.type}/${element.id}`,
      name,
      type,
      latitude,
      longitude,
      location: tags['addr:city'] ?? tags['addr:state'] ?? tags['addr:district'] ?? 'Unknown',
      riskLevel: defaultRiskLevel(type),
      operator: tags['operator'] ?? null,
    };
  }
}
