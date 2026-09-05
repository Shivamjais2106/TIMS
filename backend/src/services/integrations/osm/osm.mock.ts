import type { OsmFacility, OsmFetchParams, OsmProvider } from './osm.types';

/**
 * Curated stand-in for OpenStreetMap / Overpass results.
 *
 * These are real, publicly documented Indian industrial sites with approximate
 * coordinates. They exist so the dashboard, the map and the geospatial queries
 * have something meaningful to work with before Overpass is wired up — and so
 * demo screenshots reflect plausible geography rather than random noise.
 *
 * Replace this provider with `osm.overpass.ts` by setting OSM_ENABLED=true.
 */
export const MOCK_FACILITIES: OsmFacility[] = [
  {
    osmId: 'mock/refinery-jamnagar',
    name: 'Jamnagar Refinery Complex',
    type: 'REFINERY',
    latitude: 22.3419,
    longitude: 69.8597,
    location: 'Jamnagar, Gujarat',
    riskLevel: 'CRITICAL',
    operator: 'Reliance Industries',
  },
  {
    osmId: 'mock/refinery-vadinar',
    name: 'Vadinar Refinery',
    type: 'REFINERY',
    latitude: 22.4419,
    longitude: 69.7189,
    location: 'Vadinar, Gujarat',
    riskLevel: 'HIGH',
    operator: 'Nayara Energy',
  },
  {
    osmId: 'mock/refinery-mathura',
    name: 'Mathura Refinery',
    type: 'REFINERY',
    latitude: 27.4833,
    longitude: 77.6167,
    location: 'Mathura, Uttar Pradesh',
    riskLevel: 'HIGH',
    operator: 'Indian Oil Corporation',
  },
  {
    osmId: 'mock/refinery-panipat',
    name: 'Panipat Refinery & Petrochemical Complex',
    type: 'PETROCHEMICAL',
    latitude: 29.2333,
    longitude: 76.9667,
    location: 'Panipat, Haryana',
    riskLevel: 'HIGH',
    operator: 'Indian Oil Corporation',
  },
  {
    osmId: 'mock/petchem-dahej',
    name: 'Dahej Petrochemical Zone',
    type: 'PETROCHEMICAL',
    latitude: 21.7051,
    longitude: 72.5619,
    location: 'Dahej, Gujarat',
    riskLevel: 'CRITICAL',
    operator: 'ONGC Petro additions',
  },
  {
    osmId: 'mock/lng-dahej',
    name: 'Dahej LNG Terminal',
    type: 'LNG_TERMINAL',
    latitude: 21.6667,
    longitude: 72.5333,
    location: 'Dahej, Gujarat',
    riskLevel: 'HIGH',
    operator: 'Petronet LNG',
  },
  {
    osmId: 'mock/lng-hazira',
    name: 'Hazira LNG Terminal',
    type: 'LNG_TERMINAL',
    latitude: 21.1042,
    longitude: 72.6417,
    location: 'Hazira, Surat, Gujarat',
    riskLevel: 'HIGH',
    operator: 'Shell Energy India',
  },
  {
    osmId: 'mock/steel-jamshedpur',
    name: 'Jamshedpur Steel Works',
    type: 'STEEL',
    latitude: 22.8046,
    longitude: 86.2029,
    location: 'Jamshedpur, Jharkhand',
    riskLevel: 'HIGH',
    operator: 'Tata Steel',
  },
  {
    osmId: 'mock/steel-bhilai',
    name: 'Bhilai Steel Plant',
    type: 'STEEL',
    latitude: 21.2094,
    longitude: 81.379,
    location: 'Bhilai, Chhattisgarh',
    riskLevel: 'HIGH',
    operator: 'Steel Authority of India',
  },
  {
    osmId: 'mock/steel-rourkela',
    name: 'Rourkela Steel Plant',
    type: 'STEEL',
    latitude: 22.2268,
    longitude: 84.8536,
    location: 'Rourkela, Odisha',
    riskLevel: 'MEDIUM',
    operator: 'Steel Authority of India',
  },
  {
    osmId: 'mock/power-vindhyachal',
    name: 'Vindhyachal Super Thermal Power Station',
    type: 'POWER_PLANT',
    latitude: 24.1022,
    longitude: 82.6714,
    location: 'Singrauli, Madhya Pradesh',
    riskLevel: 'HIGH',
    operator: 'NTPC',
  },
  {
    osmId: 'mock/power-mundra',
    name: 'Mundra Thermal Power Station',
    type: 'POWER_PLANT',
    latitude: 22.8236,
    longitude: 69.5486,
    location: 'Mundra, Gujarat',
    riskLevel: 'MEDIUM',
    operator: 'Adani Power',
  },
  {
    osmId: 'mock/power-korba',
    name: 'Korba Super Thermal Power Plant',
    type: 'POWER_PLANT',
    latitude: 22.3667,
    longitude: 82.6833,
    location: 'Korba, Chhattisgarh',
    riskLevel: 'MEDIUM',
    operator: 'NTPC',
  },
  {
    osmId: 'mock/mining-jharia',
    name: 'Jharia Coalfield',
    type: 'MINING',
    latitude: 23.7401,
    longitude: 86.4131,
    location: 'Dhanbad, Jharkhand',
    riskLevel: 'CRITICAL',
    operator: 'Bharat Coking Coal',
  },
  {
    osmId: 'mock/mining-talcher',
    name: 'Talcher Coalfield',
    type: 'MINING',
    latitude: 20.9333,
    longitude: 85.2167,
    location: 'Angul, Odisha',
    riskLevel: 'HIGH',
    operator: 'Mahanadi Coalfields',
  },
  {
    osmId: 'mock/mining-singrauli',
    name: 'Singrauli Coalfield',
    type: 'MINING',
    latitude: 24.2,
    longitude: 82.6667,
    location: 'Singrauli, Madhya Pradesh',
    riskLevel: 'HIGH',
    operator: 'Northern Coalfields',
  },
  {
    osmId: 'mock/refinery-manali',
    name: 'Manali Refinery',
    type: 'REFINERY',
    latitude: 13.1667,
    longitude: 80.2667,
    location: 'Manali, Chennai, Tamil Nadu',
    riskLevel: 'MEDIUM',
    operator: 'Chennai Petroleum Corporation',
  },
  {
    osmId: 'mock/petchem-haldia',
    name: 'Haldia Petrochemicals',
    type: 'PETROCHEMICAL',
    latitude: 22.0333,
    longitude: 88.0833,
    location: 'Haldia, West Bengal',
    riskLevel: 'HIGH',
    operator: 'Haldia Petrochemicals Ltd',
  },
  {
    osmId: 'mock/refinery-visakhapatnam',
    name: 'Visakhapatnam Refinery',
    type: 'REFINERY',
    latitude: 17.6868,
    longitude: 83.2185,
    location: 'Visakhapatnam, Andhra Pradesh',
    riskLevel: 'HIGH',
    operator: 'Hindustan Petroleum',
  },
  {
    osmId: 'mock/other-taloja',
    name: 'Taloja Industrial Estate',
    type: 'OTHER',
    latitude: 19.0776,
    longitude: 73.1002,
    location: 'Taloja, Maharashtra',
    riskLevel: 'MEDIUM',
    operator: 'MIDC',
  },
];

function withinBbox(facility: OsmFacility, bbox: [number, number, number, number]): boolean {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  return (
    facility.longitude >= minLon &&
    facility.longitude <= maxLon &&
    facility.latitude >= minLat &&
    facility.latitude <= maxLat
  );
}

export class MockOsmProvider implements OsmProvider {
  readonly name = 'osm-mock';
  readonly isLive = false;

  async fetchFacilities(params: OsmFetchParams): Promise<OsmFacility[]> {
    const matches = MOCK_FACILITIES.filter((facility) => withinBbox(facility, params.bbox));
    return params.limit ? matches.slice(0, params.limit) : matches;
  }
}
