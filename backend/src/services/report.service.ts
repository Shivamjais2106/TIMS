import { PILOT, RISK_WEIGHTS } from '../config/bhopal';
import { prisma } from '../config/prisma';
import { Prisma } from '../generated/prisma/client';
import { ApiError } from '../utils/ApiError';
import { createLogger } from '../utils/logger';

const log = createLogger('reports');

/**
 * Situation report generation.
 *
 * Reports are built synchronously from real stored rows and the computed
 * summary is denormalised onto the record, so report history renders without
 * re-running every aggregate query. A report is a snapshot: re-scoring a
 * hotspot later does not rewrite a report already issued.
 */

export type ReportKind = 'incident' | 'daily' | 'weekly' | 'custom';

export interface GenerateReportInput {
  kind: ReportKind;
  title?: string;
  periodStart?: Date;
  periodEnd?: Date;
  /** Required when kind is "incident". */
  hotspotId?: string;
}

function defaultPeriod(kind: ReportKind): { start: Date; end: Date } {
  const end = new Date();
  const days = kind === 'weekly' ? 7 : 1;
  return { start: new Date(end.getTime() - days * 86_400_000), end };
}

/** Builds the headline figures for a window, from real rows only. */
async function buildSummary(start: Date, end: Date) {
  const where = { detectedAt: { gte: start, lte: end } };

  const [
    total,
    inBoundary,
    byClass,
    byRisk,
    byPath,
    persistent,
    alerts,
    alertsBySeverity,
    aggregate,
  ] = await Promise.all([
    prisma.hotspot.count({ where }),
    prisma.hotspot.count({ where: { ...where, inBhopalBoundary: true } }),
    prisma.hotspot.groupBy({ by: ['mlClass'], where, _count: { _all: true } }),
    prisma.hotspot.groupBy({ by: ['riskLevel'], where, _count: { _all: true } }),
    prisma.hotspot.groupBy({ by: ['classificationPath'], where, _count: { _all: true } }),
    prisma.hotspot.count({ where: { ...where, persistenceDays: { gte: 3 } } }),
    prisma.alert.count({ where: { createdAt: { gte: start, lte: end } } }),
    prisma.alert.groupBy({
      by: ['severity'],
      where: { createdAt: { gte: start, lte: end } },
      _count: { _all: true },
    }),
    prisma.hotspot.aggregate({
      where,
      _avg: { riskScore: true, brightnessTemperature: true, frp: true, distanceToFacilityM: true },
      _max: { riskScore: true, frp: true },
    }),
  ]);

  return {
    totalDetections: total,
    insideBoundary: inBoundary,
    persistentSources: persistent,
    alertsRaised: alerts,
    byClass: Object.fromEntries(byClass.map((row) => [row.mlClass ?? 'UNCLASSIFIED', row._count._all])),
    byRiskLevel: Object.fromEntries(byRisk.map((row) => [row.riskLevel, row._count._all])),
    // Included so a report states plainly how many of its classifications came
    // from the model versus the degraded-mode rule engine.
    byClassificationPath: Object.fromEntries(byPath.map((row) => [row.classificationPath, row._count._all])),
    alertsBySeverity: Object.fromEntries(alertsBySeverity.map((row) => [row.severity, row._count._all])),
    averages: {
      riskScore: aggregate._avg.riskScore,
      brightnessTemperature: aggregate._avg.brightnessTemperature,
      frp: aggregate._avg.frp,
      distanceToFacilityM: aggregate._avg.distanceToFacilityM,
    },
    maxima: { riskScore: aggregate._max.riskScore, frp: aggregate._max.frp },
    riskWeights: RISK_WEIGHTS,
    disclaimer:
      'Decision support only. Classifications are advisory and derive from a model ' +
      'trained on heuristic weak labels, not verified ground truth.',
  };
}

export async function generateReport(input: GenerateReportInput, userId?: string) {
  const period =
    input.periodStart && input.periodEnd
      ? { start: input.periodStart, end: input.periodEnd }
      : defaultPeriod(input.kind);

  if (period.start >= period.end) {
    throw ApiError.badRequest('periodStart must be before periodEnd');
  }

  if (input.kind === 'incident' && !input.hotspotId) {
    throw ApiError.badRequest('hotspotId is required for an incident report');
  }

  // Created QUEUED first so a failure leaves an auditable record with the
  // error attached, rather than silently producing nothing.
  const record = await prisma.report.create({
    data: {
      title: input.title ?? defaultTitle(input.kind, period.start, period.end),
      kind: input.kind,
      status: 'QUEUED',
      periodStart: period.start,
      periodEnd: period.end,
      parameters: (input as unknown as Prisma.InputJsonObject) ?? undefined,
      requestedById: userId ?? null,
    },
  });

  try {
    let summary: Record<string, unknown>;
    let hotspotCount: number;
    let alertCount: number;

    if (input.kind === 'incident' && input.hotspotId) {
      const hotspot = await prisma.hotspot.findUnique({
        where: { id: input.hotspotId },
        include: {
          industrialFacility: true,
          alerts: { orderBy: { createdAt: 'desc' } },
          riskAssessments: { orderBy: { assessedAt: 'desc' }, take: 5 },
        },
      });
      if (!hotspot) throw ApiError.notFound(`Hotspot ${input.hotspotId} not found`);

      summary = {
        incident: {
          id: hotspot.id,
          latitude: hotspot.latitude,
          longitude: hotspot.longitude,
          detectedAt: hotspot.detectedAt,
          firmsProduct: hotspot.firmsProduct,
          satellite: hotspot.satellite,
          confidence: hotspot.confidence,
          brightnessTemperature: hotspot.brightnessTemperature,
          frp: hotspot.frp,
          persistenceDays: hotspot.persistenceDays,
          riskScore: hotspot.riskScore,
          riskLevel: hotspot.riskLevel,
          mlClass: hotspot.mlClass,
          mlConfidence: hotspot.mlConfidence,
          classificationPath: hotspot.classificationPath,
          modelVersion: hotspot.modelVersion,
          inBhopalBoundary: hotspot.inBhopalBoundary,
        },
        nearestFacility: hotspot.industrialFacility
          ? { name: hotspot.industrialFacility.name, distanceMeters: hotspot.distanceToFacilityM }
          : null,
        riskHistory: hotspot.riskAssessments.map((assessment) => ({
          score: assessment.score,
          level: assessment.level,
          reasons: assessment.reasons,
          assessedAt: assessment.assessedAt,
        })),
        alerts: hotspot.alerts.map((alert) => ({
          id: alert.id,
          title: alert.title,
          severity: alert.severity,
          status: alert.status,
          createdAt: alert.createdAt,
          acknowledgedAt: alert.acknowledgedAt,
        })),
        populationEstimate: null,
        populationNote: 'Population estimate unavailable — no gridded population layer is loaded.',
      };
      hotspotCount = 1;
      alertCount = hotspot.alerts.length;
    } else {
      const built = await buildSummary(period.start, period.end);
      summary = built as unknown as Record<string, unknown>;
      hotspotCount = built.totalDetections;
      alertCount = built.alertsRaised;
    }

    const completed = await prisma.report.update({
      where: { id: record.id },
      data: {
        status: 'READY',
        summary: summary as unknown as Prisma.InputJsonObject,
        hotspotCount,
        alertCount,
        completedAt: new Date(),
      },
      include: { requestedBy: { select: { id: true, name: true, email: true } } },
    });

    log.info('Report generated', { id: completed.id, kind: completed.kind, hotspotCount, alertCount });
    return completed;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.report.update({
      where: { id: record.id },
      data: { status: 'FAILED', error: message, completedAt: new Date() },
    });
    log.error('Report generation failed', { id: record.id, error: message });
    throw error;
  }
}

function defaultTitle(kind: ReportKind, start: Date, end: Date): string {
  const day = (date: Date) => date.toISOString().slice(0, 10);
  switch (kind) {
    case 'incident':
      return `${PILOT.label} incident report — ${day(end)}`;
    case 'daily':
      return `${PILOT.label} daily situation report — ${day(end)}`;
    case 'weekly':
      return `${PILOT.label} weekly situation report — ${day(start)} to ${day(end)}`;
    default:
      return `${PILOT.label} report — ${day(start)} to ${day(end)}`;
  }
}

export async function listReports(page = 1, pageSize = 25) {
  const [items, total] = await Promise.all([
    prisma.report.findMany({
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { requestedBy: { select: { id: true, name: true, email: true } } },
    }),
    prisma.report.count(),
  ]);
  return { items, total };
}

export async function getReport(id: string) {
  const report = await prisma.report.findUnique({
    where: { id },
    include: { requestedBy: { select: { id: true, name: true, email: true } } },
  });
  if (!report) throw ApiError.notFound(`Report ${id} not found`);
  return report;
}

export async function deleteReport(id: string): Promise<void> {
  const existing = await prisma.report.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw ApiError.notFound(`Report ${id} not found`);
  await prisma.report.delete({ where: { id } });
}
