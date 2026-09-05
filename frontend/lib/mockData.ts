import type {
  Alert,
  AnalyticsSummary,
  CategoryBreakdown,
  EventType,
  FacilitySummary,
  FacilityType,
  Hotspot,
  IndustrialFacility,
  RiskLevel,
  TrendPoint,
} from '@/types';
import { PERSISTENT_SOURCE_DAYS } from './constants';

/**
 * Bundled sample dataset for demo mode.
 *
 * This exists purely so the UI can be presented when the API is unreachable
 * (see `withDemoFallback` in lib/api.ts). It is never consulted while the
 * backend is up, so deleting this file and its call sites removes demo mode
 * entirely without touching a single component.
 */

function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

interface Site {
  name: string;
  type: FacilityType;
  lat: number;
  lon: number;
  location: string;
  riskLevel: RiskLevel;
  operator: string;
  tempMin: number;
  tempRange: number;
  frpMin: number;
  frpRange: number;
  eventType: EventType;
}

const SITES: Site[] = [
  { name: 'Jamnagar Refinery Complex', type: 'REFINERY', lat: 22.3419, lon: 69.8597, location: 'Jamnagar, Gujarat', riskLevel: 'CRITICAL', operator: 'Reliance Industries', tempMin: 345, tempRange: 27, frpMin: 30, frpRange: 80, eventType: 'GAS_FLARE' },
  { name: 'Vadinar Refinery', type: 'REFINERY', lat: 22.4419, lon: 69.7189, location: 'Vadinar, Gujarat', riskLevel: 'HIGH', operator: 'Nayara Energy', tempMin: 344, tempRange: 24, frpMin: 28, frpRange: 70, eventType: 'GAS_FLARE' },
  { name: 'Dahej Petrochemical Zone', type: 'PETROCHEMICAL', lat: 21.7051, lon: 72.5619, location: 'Dahej, Gujarat', riskLevel: 'CRITICAL', operator: 'ONGC Petro additions', tempMin: 344, tempRange: 26, frpMin: 28, frpRange: 75, eventType: 'GAS_FLARE' },
  { name: 'Dahej LNG Terminal', type: 'LNG_TERMINAL', lat: 21.6667, lon: 72.5333, location: 'Dahej, Gujarat', riskLevel: 'HIGH', operator: 'Petronet LNG', tempMin: 342, tempRange: 24, frpMin: 25, frpRange: 65, eventType: 'GAS_FLARE' },
  { name: 'Hazira LNG Terminal', type: 'LNG_TERMINAL', lat: 21.1042, lon: 72.6417, location: 'Hazira, Surat, Gujarat', riskLevel: 'HIGH', operator: 'Shell Energy India', tempMin: 341, tempRange: 22, frpMin: 24, frpRange: 60, eventType: 'GAS_FLARE' },
  { name: 'Mathura Refinery', type: 'REFINERY', lat: 27.4833, lon: 77.6167, location: 'Mathura, Uttar Pradesh', riskLevel: 'HIGH', operator: 'Indian Oil Corporation', tempMin: 343, tempRange: 25, frpMin: 26, frpRange: 68, eventType: 'GAS_FLARE' },
  { name: 'Panipat Refinery Complex', type: 'PETROCHEMICAL', lat: 29.2333, lon: 76.9667, location: 'Panipat, Haryana', riskLevel: 'HIGH', operator: 'Indian Oil Corporation', tempMin: 342, tempRange: 24, frpMin: 26, frpRange: 66, eventType: 'GAS_FLARE' },
  { name: 'Jamshedpur Steel Works', type: 'STEEL', lat: 22.8046, lon: 86.2029, location: 'Jamshedpur, Jharkhand', riskLevel: 'HIGH', operator: 'Tata Steel', tempMin: 328, tempRange: 11, frpMin: 20, frpRange: 50, eventType: 'INDUSTRIAL_FIRE' },
  { name: 'Bhilai Steel Plant', type: 'STEEL', lat: 21.2094, lon: 81.379, location: 'Bhilai, Chhattisgarh', riskLevel: 'HIGH', operator: 'Steel Authority of India', tempMin: 328, tempRange: 11, frpMin: 20, frpRange: 48, eventType: 'INDUSTRIAL_FIRE' },
  { name: 'Rourkela Steel Plant', type: 'STEEL', lat: 22.2268, lon: 84.8536, location: 'Rourkela, Odisha', riskLevel: 'MEDIUM', operator: 'Steel Authority of India', tempMin: 327, tempRange: 11, frpMin: 19, frpRange: 44, eventType: 'INDUSTRIAL_FIRE' },
  { name: 'Vindhyachal Thermal Power Station', type: 'POWER_PLANT', lat: 24.1022, lon: 82.6714, location: 'Singrauli, Madhya Pradesh', riskLevel: 'HIGH', operator: 'NTPC', tempMin: 324, tempRange: 12, frpMin: 18, frpRange: 37, eventType: 'INDUSTRIAL_FIRE' },
  { name: 'Mundra Thermal Power Station', type: 'POWER_PLANT', lat: 22.8236, lon: 69.5486, location: 'Mundra, Gujarat', riskLevel: 'MEDIUM', operator: 'Adani Power', tempMin: 324, tempRange: 11, frpMin: 18, frpRange: 34, eventType: 'INDUSTRIAL_FIRE' },
  { name: 'Korba Super Thermal Power Plant', type: 'POWER_PLANT', lat: 22.3667, lon: 82.6833, location: 'Korba, Chhattisgarh', riskLevel: 'MEDIUM', operator: 'NTPC', tempMin: 324, tempRange: 12, frpMin: 18, frpRange: 36, eventType: 'INDUSTRIAL_FIRE' },
  { name: 'Jharia Coalfield', type: 'MINING', lat: 23.7401, lon: 86.4131, location: 'Dhanbad, Jharkhand', riskLevel: 'CRITICAL', operator: 'Bharat Coking Coal', tempMin: 311, tempRange: 15, frpMin: 4, frpRange: 9, eventType: 'MINING_ACTIVITY' },
  { name: 'Talcher Coalfield', type: 'MINING', lat: 20.9333, lon: 85.2167, location: 'Angul, Odisha', riskLevel: 'HIGH', operator: 'Mahanadi Coalfields', tempMin: 311, tempRange: 14, frpMin: 4, frpRange: 8, eventType: 'MINING_ACTIVITY' },
  { name: 'Singrauli Coalfield', type: 'MINING', lat: 24.2, lon: 82.6667, location: 'Singrauli, Madhya Pradesh', riskLevel: 'HIGH', operator: 'Northern Coalfields', tempMin: 311, tempRange: 15, frpMin: 4, frpRange: 9, eventType: 'MINING_ACTIVITY' },
  { name: 'Haldia Petrochemicals', type: 'PETROCHEMICAL', lat: 22.0333, lon: 88.0833, location: 'Haldia, West Bengal', riskLevel: 'HIGH', operator: 'Haldia Petrochemicals Ltd', tempMin: 340, tempRange: 22, frpMin: 24, frpRange: 60, eventType: 'GAS_FLARE' },
  { name: 'Visakhapatnam Refinery', type: 'REFINERY', lat: 17.6868, lon: 83.2185, location: 'Visakhapatnam, Andhra Pradesh', riskLevel: 'HIGH', operator: 'Hindustan Petroleum', tempMin: 343, tempRange: 24, frpMin: 27, frpRange: 66, eventType: 'GAS_FLARE' },
  { name: 'Manali Refinery', type: 'REFINERY', lat: 13.1667, lon: 80.2667, location: 'Manali, Chennai, Tamil Nadu', riskLevel: 'MEDIUM', operator: 'Chennai Petroleum Corporation', tempMin: 341, tempRange: 22, frpMin: 25, frpRange: 58, eventType: 'GAS_FLARE' },
  { name: 'Taloja Industrial Estate', type: 'OTHER', lat: 19.0776, lon: 73.1002, location: 'Taloja, Maharashtra', riskLevel: 'MEDIUM', operator: 'MIDC', tempMin: 322, tempRange: 12, frpMin: 8, frpRange: 22, eventType: 'INDUSTRIAL_FIRE' },
];

const RURAL = [
  { region: 'Punjab', lat: 30.6, lon: 75.5, spread: 1.1, eventType: 'AGRICULTURAL_FIRE' as EventType },
  { region: 'Haryana', lat: 29.4, lon: 76.4, spread: 0.9, eventType: 'AGRICULTURAL_FIRE' as EventType },
  { region: 'Madhya Pradesh', lat: 21.8, lon: 79.6, spread: 1.6, eventType: 'FOREST_FIRE' as EventType },
  { region: 'Karnataka', lat: 13.5, lon: 75.3, spread: 1.3, eventType: 'FOREST_FIRE' as EventType },
  { region: 'Andhra Pradesh', lat: 18.8, lon: 82.9, spread: 1.4, eventType: 'FOREST_FIRE' as EventType },
];

function toRiskLevel(score: number): RiskLevel {
  if (score >= 80) return 'CRITICAL';
  if (score >= 60) return 'HIGH';
  if (score >= 35) return 'MEDIUM';
  return 'LOW';
}

const WINDOW_DAYS = 30;

/** Anchored to the end of today so repeated renders in one session are stable. */
const EPOCH = (() => {
  const now = new Date();
  now.setHours(23, 45, 0, 0);
  return now.getTime();
})();

export const MOCK_FACILITIES: IndustrialFacility[] = SITES.map((site, index) => ({
  id: `demo-fac-${index + 1}`,
  name: site.name,
  type: site.type,
  latitude: site.lat,
  longitude: site.lon,
  location: site.location,
  riskLevel: site.riskLevel,
  operator: site.operator,
  osmId: `mock/${index + 1}`,
  createdAt: new Date(EPOCH - 120 * 86_400_000).toISOString(),
  updatedAt: new Date(EPOCH).toISOString(),
}));

export const MOCK_HOTSPOTS: Hotspot[] = (() => {
  const random = createRandom(90210);
  const hotspots: Hotspot[] = [];
  let counter = 0;

  for (let dayOffset = WINDOW_DAYS - 1; dayOffset >= 0; dayOffset -= 1) {
    const dayStart = EPOCH - dayOffset * 86_400_000;

    SITES.forEach((site, siteIndex) => {
      if (random() > (site.type === 'POWER_PLANT' || site.type === 'OTHER' ? 0.5 : 0.8)) return;

      const facility = MOCK_FACILITIES[siteIndex]!;
      const latitude = Number((site.lat + (random() - 0.5) * 0.028).toFixed(5));
      const longitude = Number((site.lon + (random() - 0.5) * 0.028).toFixed(5));
      const brightness = Number((site.tempMin + random() * site.tempRange).toFixed(2));
      const frp = Number((site.frpMin + random() * site.frpRange).toFixed(2));
      const confidence = 70 + Math.floor(random() * 30);
      const persistenceDays = 4 + Math.floor(random() * 18);
      const distance = Math.round(200 + random() * 1600);

      const riskScore =
        Math.round(
          Math.min(
            100,
            ((brightness - 300) / 100) * 30 +
              (frp / 100) * 20 +
              (persistenceDays / 14) * 20 +
              (1 - distance / 5000) * 20 +
              (confidence / 100) * 10,
          ) * 10,
        ) / 10;

      counter += 1;
      hotspots.push({
        id: `demo-hs-${counter}`,
        latitude,
        longitude,
        detectedAt: new Date(dayStart - Math.floor(random() * 82_800_000)).toISOString(),
        confidence,
        brightnessTemperature: brightness,
        eventType: site.eventType,
        persistenceDays,
        riskScore,
        riskLevel: toRiskLevel(riskScore),
        source: 'VIIRS_SNPP_NRT',
        frp,
        satellite: 'N',
        dayNight: random() > 0.45 ? 'N' : 'D',
        region: site.location.split(', ').pop() ?? null,
        externalId: `demo:${counter}`,
        industrialFacilityId: facility.id,
        industrialFacility: {
          id: facility.id,
          name: facility.name,
          type: facility.type,
          location: facility.location,
          latitude: facility.latitude,
          longitude: facility.longitude,
          riskLevel: facility.riskLevel,
        },
        distanceToFacilityM: distance,
        createdAt: new Date(dayStart).toISOString(),
        updatedAt: new Date(dayStart).toISOString(),
      });
    });

    for (const cluster of RURAL) {
      const count =
        cluster.eventType === 'AGRICULTURAL_FIRE' ? 2 + Math.floor(random() * 4) : 1 + Math.floor(random() * 3);

      for (let index = 0; index < count; index += 1) {
        const isForest = cluster.eventType === 'FOREST_FIRE';
        const brightness = Number(((isForest ? 318 : 308) + random() * 18).toFixed(2));
        const frp = Number(((isForest ? 20 : 3) + random() * (isForest ? 45 : 9)).toFixed(2));
        const confidence = isForest ? 55 + Math.floor(random() * 40) : 40 + Math.floor(random() * 45);
        const persistenceDays = isForest ? 1 + Math.floor(random() * 3) : 1;

        const riskScore =
          Math.round(
            Math.min(
              100,
              (((brightness - 300) / 100) * 30 +
                (frp / 100) * 20 +
                (persistenceDays / 14) * 20 +
                (confidence / 100) * 10) *
                (isForest ? 0.9 : 0.75),
            ) * 10,
          ) / 10;

        counter += 1;
        hotspots.push({
          id: `demo-hs-${counter}`,
          latitude: Number((cluster.lat + (random() - 0.5) * cluster.spread).toFixed(5)),
          longitude: Number((cluster.lon + (random() - 0.5) * cluster.spread).toFixed(5)),
          detectedAt: new Date(dayStart - Math.floor(random() * 82_800_000)).toISOString(),
          confidence,
          brightnessTemperature: brightness,
          eventType: cluster.eventType,
          persistenceDays,
          riskScore,
          riskLevel: toRiskLevel(riskScore),
          source: 'VIIRS_SNPP_NRT',
          frp,
          satellite: 'N20',
          dayNight: random() > 0.75 ? 'N' : 'D',
          region: cluster.region,
          externalId: `demo:${counter}`,
          industrialFacilityId: null,
          industrialFacility: null,
          distanceToFacilityM: null,
          createdAt: new Date(dayStart).toISOString(),
          updatedAt: new Date(dayStart).toISOString(),
        });
      }
    }
  }

  return hotspots.sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime());
})();

export const MOCK_ALERTS: Alert[] = MOCK_HOTSPOTS.filter(
  (hotspot) => hotspot.riskLevel === 'CRITICAL' || (hotspot.riskLevel === 'HIGH' && hotspot.industrialFacility),
)
  .slice(0, 14)
  .map((hotspot, index) => ({
    id: `demo-alert-${index + 1}`,
    title: `${hotspot.eventType === 'GAS_FLARE' ? 'Persistent flare' : 'Thermal anomaly'} near ${
      hotspot.industrialFacility?.name ?? hotspot.region ?? 'unclassified area'
    }`,
    message:
      `A ${hotspot.eventType.replace(/_/g, ' ').toLowerCase()} was detected near ` +
      `${hotspot.industrialFacility?.name ?? hotspot.region ?? 'an unclassified area'}` +
      `${hotspot.distanceToFacilityM ? ` (${hotspot.distanceToFacilityM} m away)` : ''}. ` +
      `Risk score ${hotspot.riskScore}/100, active for ${hotspot.persistenceDays} day(s). ` +
      'Verify against ground reports before escalation.',
    severity: hotspot.riskLevel,
    isRead: index >= 11,
    createdAt: hotspot.detectedAt,
    updatedAt: hotspot.detectedAt,
    hotspotId: hotspot.id,
    hotspot: {
      id: hotspot.id,
      latitude: hotspot.latitude,
      longitude: hotspot.longitude,
      eventType: hotspot.eventType,
      riskLevel: hotspot.riskLevel,
      riskScore: hotspot.riskScore,
      detectedAt: hotspot.detectedAt,
      persistenceDays: hotspot.persistenceDays,
      industrialFacility: hotspot.industrialFacility,
    },
    acknowledgedById: null,
    acknowledgedBy: null,
    acknowledgedAt: index >= 11 ? hotspot.detectedAt : null,
  }));

/** Recomputes the dashboard aggregates from MOCK_HOTSPOTS so nothing drifts. */
function inWindow(hotspot: Hotspot, days: number, offsetDays = 0): boolean {
  const time = new Date(hotspot.detectedAt).getTime();
  const end = EPOCH - offsetDays * 86_400_000;
  const start = end - days * 86_400_000;
  return time > start && time <= end;
}

function delta(value: number, previous: number) {
  const changePercent = previous === 0 ? (value === 0 ? 0 : null) : ((value - previous) / previous) * 100;
  return { value, previous, changePercent: changePercent === null ? null : Math.round(changePercent * 10) / 10 };
}

export function mockSummary(days = WINDOW_DAYS): AnalyticsSummary {
  const current = MOCK_HOTSPOTS.filter((hotspot) => inWindow(hotspot, days));
  const previous = MOCK_HOTSPOTS.filter((hotspot) => inWindow(hotspot, days, days));

  const industrial = (list: Hotspot[]) =>
    list.filter((hotspot) => hotspot.eventType === 'INDUSTRIAL_FIRE' || hotspot.eventType === 'GAS_FLARE').length;
  const persistent = (list: Hotspot[]) =>
    list.filter((hotspot) => hotspot.persistenceDays >= PERSISTENT_SOURCE_DAYS).length;
  const highRisk = (list: Hotspot[]) =>
    list.filter((hotspot) => hotspot.riskLevel === 'HIGH' || hotspot.riskLevel === 'CRITICAL').length;
  const average = (list: Hotspot[], pick: (hotspot: Hotspot) => number) =>
    list.length === 0 ? 0 : Math.round((list.reduce((sum, item) => sum + pick(item), 0) / list.length) * 10) / 10;

  const riskLevels: RiskLevel[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

  return {
    windowDays: days,
    generatedAt: new Date(EPOCH).toISOString(),
    totalThermalEvents: delta(current.length, previous.length),
    industrialFireEvents: delta(industrial(current), industrial(previous)),
    persistentThermalSources: delta(persistent(current), persistent(previous)),
    highRiskEvents: delta(highRisk(current), highRisk(previous)),
    averageRiskScore: average(current, (hotspot) => hotspot.riskScore),
    averageBrightnessTemperature: average(current, (hotspot) => hotspot.brightnessTemperature),
    unreadAlerts: MOCK_ALERTS.filter((alert) => !alert.isRead).length,
    monitoredFacilities: MOCK_FACILITIES.length,
    riskDistribution: riskLevels.map((riskLevel) => ({
      riskLevel,
      count: current.filter((hotspot) => hotspot.riskLevel === riskLevel).length,
    })),
    alertsBySeverity: riskLevels.map((severity) => ({
      severity,
      count: MOCK_ALERTS.filter((alert) => alert.severity === severity).length,
    })),
  };
}

export function mockTrends(days = WINDOW_DAYS): TrendPoint[] {
  const points: TrendPoint[] = [];

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const dayEnd = EPOCH - offset * 86_400_000;
    const dayStart = dayEnd - 86_400_000;
    const bucket = MOCK_HOTSPOTS.filter((hotspot) => {
      const time = new Date(hotspot.detectedAt).getTime();
      return time > dayStart && time <= dayEnd;
    });

    points.push({
      date: new Date(dayEnd).toISOString().slice(0, 10),
      total: bucket.length,
      industrial: bucket.filter((h) => h.eventType === 'INDUSTRIAL_FIRE' || h.eventType === 'GAS_FLARE').length,
      persistent: bucket.filter((h) => h.persistenceDays >= PERSISTENT_SOURCE_DAYS).length,
      highRisk: bucket.filter((h) => h.riskLevel === 'HIGH' || h.riskLevel === 'CRITICAL').length,
      avgRiskScore:
        bucket.length === 0
          ? 0
          : Math.round((bucket.reduce((sum, h) => sum + h.riskScore, 0) / bucket.length) * 10) / 10,
    });
  }

  return points;
}

export function mockCategories(days = WINDOW_DAYS): CategoryBreakdown {
  const current = MOCK_HOTSPOTS.filter((hotspot) => inWindow(hotspot, days));
  const total = current.length;
  const share = (count: number) => (total === 0 ? 0 : Math.round((count / total) * 1000) / 10);

  const eventTypes: EventType[] = [
    'INDUSTRIAL_FIRE',
    'GAS_FLARE',
    'AGRICULTURAL_FIRE',
    'FOREST_FIRE',
    'MINING_ACTIVITY',
    'OTHER',
  ];
  const riskLevels: RiskLevel[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

  const regions = new Map<string, { count: number; highRisk: number }>();
  for (const hotspot of current) {
    const key = hotspot.region ?? 'Unclassified';
    const entry = regions.get(key) ?? { count: 0, highRisk: 0 };
    entry.count += 1;
    if (hotspot.riskLevel === 'HIGH' || hotspot.riskLevel === 'CRITICAL') entry.highRisk += 1;
    regions.set(key, entry);
  }

  const facilityTypes = new Map<string, { count: number; hotspotCount: number }>();
  for (const facility of MOCK_FACILITIES) {
    const entry = facilityTypes.get(facility.type) ?? { count: 0, hotspotCount: 0 };
    entry.count += 1;
    entry.hotspotCount += current.filter((hotspot) => hotspot.industrialFacilityId === facility.id).length;
    facilityTypes.set(facility.type, entry);
  }

  return {
    windowDays: days,
    byEventType: eventTypes.map((eventType) => {
      const bucket = current.filter((hotspot) => hotspot.eventType === eventType);
      const avg = (pick: (hotspot: Hotspot) => number) =>
        bucket.length === 0 ? 0 : Math.round((bucket.reduce((sum, h) => sum + pick(h), 0) / bucket.length) * 10) / 10;
      return {
        eventType,
        count: bucket.length,
        share: share(bucket.length),
        avgRiskScore: avg((hotspot) => hotspot.riskScore),
        avgBrightnessTemperature: avg((hotspot) => hotspot.brightnessTemperature),
      };
    }),
    byRiskLevel: riskLevels.map((riskLevel) => {
      const count = current.filter((hotspot) => hotspot.riskLevel === riskLevel).length;
      return { riskLevel, count, share: share(count) };
    }),
    bySource: [{ source: 'VIIRS_SNPP_NRT', count: total }],
    byRegion: [...regions.entries()]
      .map(([region, value]) => ({ region, ...value }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12),
    byFacilityType: [...facilityTypes.entries()]
      .map(([facilityType, value]) => ({ facilityType, ...value }))
      .sort((a, b) => b.hotspotCount - a.hotspotCount),
  };
}

export function mockFacilitySummary(): FacilitySummary {
  const counts = new Map<string, number>();
  for (const hotspot of MOCK_HOTSPOTS) {
    if (!hotspot.industrialFacilityId) continue;
    counts.set(hotspot.industrialFacilityId, (counts.get(hotspot.industrialFacilityId) ?? 0) + 1);
  }

  const byType = new Map<FacilityType, number>();
  for (const facility of MOCK_FACILITIES) {
    byType.set(facility.type, (byType.get(facility.type) ?? 0) + 1);
  }

  return {
    total: MOCK_FACILITIES.length,
    byType: [...byType.entries()].map(([type, count]) => ({ type, count })),
    topFacilities: [...MOCK_FACILITIES]
      .map((facility) => ({
        id: facility.id,
        name: facility.name,
        type: facility.type,
        location: facility.location,
        riskLevel: facility.riskLevel,
        latitude: facility.latitude,
        longitude: facility.longitude,
        hotspotCount: counts.get(facility.id) ?? 0,
      }))
      .sort((a, b) => b.hotspotCount - a.hotspotCount)
      .slice(0, 6),
  };
}

/** Demo-mode identity, shown in the header when the API is unreachable. */
export const MOCK_USER = {
  id: 'demo-user',
  name: 'Demo Analyst',
  email: 'demo@tims.gov.in',
  role: 'ANALYST' as const,
  createdAt: new Date(EPOCH - 90 * 86_400_000).toISOString(),
  updatedAt: new Date(EPOCH).toISOString(),
};
