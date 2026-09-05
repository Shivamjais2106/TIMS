import { prisma } from '../config/prisma';
import type { EventType, RiskLevel, Severity } from '../generated/prisma/enums';
import { PERSISTENT_SOURCE_DAYS } from '../utils/risk';
import type { CategoriesQuery, SummaryQuery, TrendsQuery } from '../validators/analytics.schema';

const EVENT_TYPES: EventType[] = [
  'INDUSTRIAL_FIRE',
  'GAS_FLARE',
  'AGRICULTURAL_FIRE',
  'FOREST_FIRE',
  'MINING_ACTIVITY',
  'OTHER',
];
const RISK_LEVELS: RiskLevel[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

export interface StatDelta {
  value: number;
  previous: number;
  /** Percentage change vs the previous window of the same length. */
  changePercent: number | null;
}

export interface AnalyticsSummary {
  windowDays: number;
  generatedAt: string;
  totalThermalEvents: StatDelta;
  industrialFireEvents: StatDelta;
  persistentThermalSources: StatDelta;
  highRiskEvents: StatDelta;
  averageRiskScore: number;
  averageBrightnessTemperature: number;
  unreadAlerts: number;
  monitoredFacilities: number;
  riskDistribution: Array<{ riskLevel: RiskLevel; count: number }>;
  alertsBySeverity: Array<{ severity: Severity; count: number }>;
}

function delta(value: number, previous: number): StatDelta {
  const changePercent = previous === 0 ? (value === 0 ? 0 : null) : ((value - previous) / previous) * 100;
  return {
    value,
    previous,
    changePercent: changePercent === null ? null : Math.round(changePercent * 10) / 10,
  };
}

function windowBounds(days: number): { current: Date; previous: Date; now: Date } {
  const now = new Date();
  const current = new Date(now.getTime() - days * 86_400_000);
  const previous = new Date(now.getTime() - 2 * days * 86_400_000);
  return { current, previous, now };
}

/** Dashboard stat tiles: the four headline counters plus supporting aggregates. */
export async function getSummary(query: SummaryQuery): Promise<AnalyticsSummary> {
  const { current, previous } = windowBounds(query.days);

  const currentWindow = { detectedAt: { gte: current } };
  const previousWindow = { detectedAt: { gte: previous, lt: current } };

  const [
    totalCurrent,
    totalPrevious,
    industrialCurrent,
    industrialPrevious,
    persistentCurrent,
    persistentPrevious,
    highRiskCurrent,
    highRiskPrevious,
    aggregates,
    unreadAlerts,
    monitoredFacilities,
    riskGroups,
    alertGroups,
  ] = await Promise.all([
    prisma.hotspot.count({ where: currentWindow }),
    prisma.hotspot.count({ where: previousWindow }),
    prisma.hotspot.count({ where: { ...currentWindow, eventType: { in: ['INDUSTRIAL_FIRE', 'GAS_FLARE'] } } }),
    prisma.hotspot.count({ where: { ...previousWindow, eventType: { in: ['INDUSTRIAL_FIRE', 'GAS_FLARE'] } } }),
    prisma.hotspot.count({ where: { ...currentWindow, persistenceDays: { gte: PERSISTENT_SOURCE_DAYS } } }),
    prisma.hotspot.count({ where: { ...previousWindow, persistenceDays: { gte: PERSISTENT_SOURCE_DAYS } } }),
    prisma.hotspot.count({ where: { ...currentWindow, riskLevel: { in: ['HIGH', 'CRITICAL'] } } }),
    prisma.hotspot.count({ where: { ...previousWindow, riskLevel: { in: ['HIGH', 'CRITICAL'] } } }),
    prisma.hotspot.aggregate({
      where: currentWindow,
      _avg: { riskScore: true, brightnessTemperature: true },
    }),
    prisma.alert.count({ where: { isRead: false } }),
    prisma.industrialFacility.count(),
    prisma.hotspot.groupBy({ by: ['riskLevel'], where: currentWindow, _count: { _all: true } }),
    prisma.alert.groupBy({ by: ['severity'], _count: { _all: true } }),
  ]);

  const riskMap = new Map(riskGroups.map((row) => [row.riskLevel, row._count._all]));
  const alertMap = new Map(alertGroups.map((row) => [row.severity, row._count._all]));

  return {
    windowDays: query.days,
    generatedAt: new Date().toISOString(),
    totalThermalEvents: delta(totalCurrent, totalPrevious),
    industrialFireEvents: delta(industrialCurrent, industrialPrevious),
    persistentThermalSources: delta(persistentCurrent, persistentPrevious),
    highRiskEvents: delta(highRiskCurrent, highRiskPrevious),
    averageRiskScore: Math.round((aggregates._avg.riskScore ?? 0) * 10) / 10,
    averageBrightnessTemperature: Math.round((aggregates._avg.brightnessTemperature ?? 0) * 10) / 10,
    unreadAlerts,
    monitoredFacilities,
    riskDistribution: RISK_LEVELS.map((riskLevel) => ({ riskLevel, count: riskMap.get(riskLevel) ?? 0 })),
    alertsBySeverity: (['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as Severity[]).map((severity) => ({
      severity,
      count: alertMap.get(severity) ?? 0,
    })),
  };
}

export interface TrendPoint {
  /** Bucket start, ISO date (YYYY-MM-DD) for day/week, YYYY-MM-01 for month. */
  date: string;
  total: number;
  industrial: number;
  persistent: number;
  highRisk: number;
  avgRiskScore: number;
}

interface TrendRow {
  bucket: Date;
  total: bigint;
  industrial: bigint;
  persistent: bigint;
  highRisk: bigint;
  avgRiskScore: number | null;
}

/**
 * Time series for the "Thermal events trend" chart.
 *
 * Uses `generate_series` so empty days still appear as zeroes — a chart with
 * gaps silently misleads, which matters for an operations dashboard.
 */
export async function getTrends(query: TrendsQuery): Promise<TrendPoint[]> {
  const { days, interval } = query;

  const rows = await prisma.$queryRaw<TrendRow[]>`
    WITH buckets AS (
      SELECT generate_series(
        date_trunc(${interval}::text, now() - (${days}::int - 1) * interval '1 day'),
        date_trunc(${interval}::text, now()),
        ('1 ' || ${interval}::text)::interval
      ) AS bucket
    )
    SELECT
      b.bucket AS "bucket",
      COUNT(h."id") AS "total",
      COUNT(h."id") FILTER (WHERE h."eventType" IN ('INDUSTRIAL_FIRE', 'GAS_FLARE')) AS "industrial",
      COUNT(h."id") FILTER (WHERE h."persistenceDays" >= ${PERSISTENT_SOURCE_DAYS}::int) AS "persistent",
      COUNT(h."id") FILTER (WHERE h."riskLevel" IN ('HIGH', 'CRITICAL')) AS "highRisk",
      AVG(h."riskScore") AS "avgRiskScore"
    FROM buckets b
    LEFT JOIN "hotspots" h
      ON date_trunc(${interval}::text, h."detectedAt") = b.bucket
    GROUP BY b.bucket
    ORDER BY b.bucket ASC
  `;

  return rows.map((row) => ({
    date: row.bucket.toISOString().slice(0, 10),
    total: Number(row.total),
    industrial: Number(row.industrial),
    persistent: Number(row.persistent),
    highRisk: Number(row.highRisk),
    avgRiskScore: Math.round((row.avgRiskScore ?? 0) * 10) / 10,
  }));
}

export interface CategoryBreakdown {
  windowDays: number;
  byEventType: Array<{
    eventType: EventType;
    count: number;
    share: number;
    avgRiskScore: number;
    avgBrightnessTemperature: number;
  }>;
  byRiskLevel: Array<{ riskLevel: RiskLevel; count: number; share: number }>;
  bySource: Array<{ source: string; count: number }>;
  byRegion: Array<{ region: string; count: number; highRisk: number }>;
  byFacilityType: Array<{ facilityType: string; count: number; hotspotCount: number }>;
}

/** Categorical breakdowns backing the analytics page charts. */
export async function getCategories(query: CategoriesQuery): Promise<CategoryBreakdown> {
  const since = new Date(Date.now() - query.days * 86_400_000);
  const where = { detectedAt: { gte: since } };

  const [eventGroups, riskGroups, sourceGroups, regionRows, facilityRows, total] = await Promise.all([
    prisma.hotspot.groupBy({
      by: ['eventType'],
      where,
      _count: { _all: true },
      _avg: { riskScore: true, brightnessTemperature: true },
    }),
    prisma.hotspot.groupBy({ by: ['riskLevel'], where, _count: { _all: true } }),
    prisma.hotspot.groupBy({ by: ['source'], where, _count: { _all: true } }),
    prisma.$queryRaw<Array<{ region: string | null; count: bigint; highRisk: bigint }>>`
      SELECT
        h."region" AS "region",
        COUNT(*) AS "count",
        COUNT(*) FILTER (WHERE h."riskLevel" IN ('HIGH', 'CRITICAL')) AS "highRisk"
      FROM "hotspots" h
      WHERE h."detectedAt" >= ${since}
      GROUP BY h."region"
      ORDER BY COUNT(*) DESC
      LIMIT 12
    `,
    prisma.$queryRaw<Array<{ facilityType: string; count: bigint; hotspotCount: bigint }>>`
      SELECT
        f."type"::text AS "facilityType",
        COUNT(DISTINCT f."id") AS "count",
        COUNT(h."id") AS "hotspotCount"
      FROM "industrial_facilities" f
      LEFT JOIN "hotspots" h
        ON h."industrialFacilityId" = f."id" AND h."detectedAt" >= ${since}
      GROUP BY f."type"
      ORDER BY COUNT(h."id") DESC
    `,
    prisma.hotspot.count({ where }),
  ]);

  const eventMap = new Map(eventGroups.map((row) => [row.eventType, row]));
  const riskMap = new Map(riskGroups.map((row) => [row.riskLevel, row._count._all]));
  const share = (count: number) => (total === 0 ? 0 : Math.round((count / total) * 1000) / 10);

  return {
    windowDays: query.days,
    byEventType: EVENT_TYPES.map((eventType) => {
      const row = eventMap.get(eventType);
      const count = row?._count._all ?? 0;
      return {
        eventType,
        count,
        share: share(count),
        avgRiskScore: Math.round((row?._avg.riskScore ?? 0) * 10) / 10,
        avgBrightnessTemperature: Math.round((row?._avg.brightnessTemperature ?? 0) * 10) / 10,
      };
    }),
    byRiskLevel: RISK_LEVELS.map((riskLevel) => {
      const count = riskMap.get(riskLevel) ?? 0;
      return { riskLevel, count, share: share(count) };
    }),
    bySource: sourceGroups.map((row) => ({ source: row.source, count: row._count._all })),
    byRegion: regionRows.map((row) => ({
      region: row.region ?? 'Unclassified',
      count: Number(row.count),
      highRisk: Number(row.highRisk),
    })),
    byFacilityType: facilityRows.map((row) => ({
      facilityType: row.facilityType,
      count: Number(row.count),
      hotspotCount: Number(row.hotspotCount),
    })),
  };
}
