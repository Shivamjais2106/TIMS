import { env } from '../../../config/env';
import type { EmergencyFacilityType, FacilityType, RiskLevel } from '../../../generated/prisma/enums';
import { createLogger } from '../../../utils/logger';
import type {
  OsmEmergencyFacility,
  OsmFacility,
  OsmFetchParams,
  OsmProvider,
} from './osm.types';

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
 * Order matters: the most specific tag combination is checked first, because
 * a site can carry several of these tags at once.
 */
function classifyFacility(tags: Record<string, string>): FacilityType {
  const industrial = tags['industrial'] ?? '';
  const manMade = tags['man_made'] ?? '';
  const power = tags['power'] ?? '';
  const plantSource = tags['plant:source'] ?? '';
  const product = (tags['product'] ?? '').toLowerCase();
  const landuse = tags['landuse'] ?? '';
  const craft = tags['craft'] ?? '';
  const name = (tags['name'] ?? '').toLowerCase();

  if (industrial === 'refinery' || industrial === 'oil' || product.includes('petroleum')) return 'REFINERY';
  if (industrial === 'chemical' || industrial === 'petrochemical' || product.includes('chemical')) {
    return 'PETROCHEMICAL';
  }
  if (power === 'plant' || plantSource.length > 0) return 'POWER_PLANT';
  if (product.includes('lng') || tags['pipeline'] === 'lng') return 'LNG_TERMINAL';
  if (industrial === 'steel' || product.includes('steel') || name.includes('steel')) return 'STEEL';
  if (landuse === 'quarry' || industrial === 'mine' || manMade === 'mineshaft') return 'MINING';
  // Brick kilns are a dominant persistent thermal source across central India
  // and are tagged inconsistently, so both the craft tag and the name are used.
  if (craft === 'brickyard' || name.includes('brick') || name.includes('kiln')) return 'OTHER';
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

function classifyEmergency(tags: Record<string, string>): EmergencyFacilityType | null {
  switch (tags['amenity']) {
    case 'hospital':
    case 'clinic':
      return 'HOSPITAL';
    case 'fire_station':
      return 'FIRE_STATION';
    case 'school':
    case 'college':
    case 'university':
      return 'SCHOOL';
    case 'police':
      return 'POLICE';
    case 'shelter':
      return 'SHELTER';
    default:
      break;
  }
  if (tags['emergency'] === 'water_tank' || tags['man_made'] === 'water_tower') return 'WATER_SOURCE';
  return null;
}

/** Overpass expects south,west,north,east — the reverse of our bbox order. */
function toOverpassArea(bbox: [number, number, number, number]): string {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  return `${minLat},${minLng},${maxLat},${maxLng}`;
}

function buildIndustrialQuery(bbox: [number, number, number, number], limit: number): string {
  const area = toOverpassArea(bbox);
  return `
    [out:json][timeout:120];
    (
      nwr["landuse"="industrial"](${area});
      nwr["man_made"="works"](${area});
      nwr["power"="plant"](${area});
      nwr["industrial"](${area});
      nwr["craft"="brickyard"](${area});
      nwr["landuse"="quarry"](${area});
    );
    out center tags ${limit};
  `.trim();
}

function buildEmergencyQuery(bbox: [number, number, number, number], limit: number): string {
  const area = toOverpassArea(bbox);
  return `
    [out:json][timeout:120];
    (
      nwr["amenity"="hospital"](${area});
      nwr["amenity"="clinic"](${area});
      nwr["amenity"="fire_station"](${area});
      nwr["amenity"="school"](${area});
      nwr["amenity"="police"](${area});
      nwr["amenity"="shelter"](${area});
    );
    out center tags ${limit};
  `.trim();
}

/** Human-readable place from whichever address tags OSM happens to carry. */
function resolveLocation(tags: Record<string, string>): string {
  return (
    tags['addr:suburb'] ??
    tags['addr:city'] ??
    tags['addr:district'] ??
    tags['addr:state'] ??
    'Bhopal'
  );
}

function resolveAddress(tags: Record<string, string>): string | null {
  const parts = [
    tags['addr:housenumber'],
    tags['addr:street'],
    tags['addr:suburb'],
    tags['addr:city'],
    tags['addr:postcode'],
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(', ') : null;
}

/**
 * Live OpenStreetMap provider backed by the Overpass API.
 *
 * Overpass answers HTTP 406 to clients that do not send a User-Agent, and
 * rate-limits aggressively, so both requests identify themselves and the two
 * category queries are issued separately rather than as one giant union.
 */
export class OverpassOsmProvider implements OsmProvider {
  readonly name = 'osm-overpass';
  readonly isLive = true;

  private async query(data: string, label: string): Promise<OverpassElement[]> {
    log.info(`Querying Overpass (${label})`);

    const response = await fetch(env.OSM_OVERPASS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        // Anonymous requests are rejected with HTTP 406 Not Acceptable.
        'User-Agent': env.OSM_USER_AGENT,
        Accept: 'application/json',
      },
      body: new URLSearchParams({ data }).toString(),
      signal: AbortSignal.timeout(180_000),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Overpass responded ${response.status} ${response.statusText} for ${label}: ${body.slice(0, 200).trim()}`,
      );
    }

    const payload = (await response.json()) as OverpassResponse;
    log.info(`Overpass returned ${payload.elements.length} element(s) for ${label}`);
    return payload.elements;
  }

  async fetchFacilities(params: OsmFetchParams): Promise<OsmFacility[]> {
    const limit = params.limit ?? 2_000;
    const elements = await this.query(buildIndustrialQuery(params.bbox, limit), 'industrial');

    return elements
      .map((element) => this.toFacility(element))
      .filter((facility): facility is OsmFacility => facility !== null);
  }

  async fetchEmergencyFacilities(params: OsmFetchParams): Promise<OsmEmergencyFacility[]> {
    const limit = params.limit ?? 2_000;
    const elements = await this.query(buildEmergencyQuery(params.bbox, limit), 'emergency');

    return elements
      .map((element) => this.toEmergencyFacility(element))
      .filter((facility): facility is OsmEmergencyFacility => facility !== null);
  }

  private toFacility(element: OverpassElement): OsmFacility | null {
    const tags = element.tags ?? {};
    const latitude = element.lat ?? element.center?.lat;
    const longitude = element.lon ?? element.center?.lon;

    // Geometry is non-negotiable - without a coordinate the element cannot
    // contribute to any spatial feature.
    if (latitude === undefined || longitude === undefined) return null;

    const type = classifyFacility(tags);
    const tagged = tags['name'] ?? tags['operator'];

    // An earlier version dropped unnamed elements. In the Bhopal pilot bbox
    // that discarded 70 of 82 industrial zones - every unnamed
    // `landuse=industrial` polygon - which are exactly the zones the
    // distance-to-facility feature needs. They are kept with a derived label
    // and flagged so the UI can show the name is synthesised.
    const name = tagged ?? `Industrial zone ${element.type}/${element.id}`;

    return {
      osmId: `${element.type}/${element.id}`,
      name,
      type,
      latitude,
      longitude,
      location: resolveLocation(tags),
      riskLevel: defaultRiskLevel(type),
      operator: tags['operator'] ?? null,
      nameDerived: tagged === undefined,
    };
  }

  private toEmergencyFacility(element: OverpassElement): OsmEmergencyFacility | null {
    const tags = element.tags ?? {};
    const latitude = element.lat ?? element.center?.lat;
    const longitude = element.lon ?? element.center?.lon;
    if (latitude === undefined || longitude === undefined) return null;

    const type = classifyEmergency(tags);
    if (type === null) return null;

    const tagged = tags['name'];
    const label = type.replace(/_/g, ' ').toLowerCase();

    return {
      osmId: `${element.type}/${element.id}`,
      name: tagged ?? `Unnamed ${label} (${element.type}/${element.id})`,
      type,
      latitude,
      longitude,
      address: resolveAddress(tags),
      // Never invented: null when OSM does not state a capacity.
      capacity: tags['capacity:beds'] ?? tags['beds'] ?? tags['capacity'] ?? null,
      phone: tags['phone'] ?? tags['contact:phone'] ?? null,
      operator: tags['operator'] ?? null,
      ownership: tags['operator:type'] ?? tags['healthcare:ownership'] ?? null,
      nameDerived: tagged === undefined,
    };
  }
}
