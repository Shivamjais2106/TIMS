import { prisma } from '../config/prisma';
import { Prisma } from '../generated/prisma/client';
import type { Severity } from '../generated/prisma/enums';
import { ApiError } from '../utils/ApiError';
import type { CreateAlertInput, ListAlertsQuery } from '../validators/alert.schema';

const alertInclude = {
  hotspot: {
    select: {
      id: true,
      latitude: true,
      longitude: true,
      eventType: true,
      riskLevel: true,
      riskScore: true,
      detectedAt: true,
      persistenceDays: true,
      industrialFacility: { select: { id: true, name: true, location: true, type: true } },
    },
  },
  acknowledgedBy: { select: { id: true, name: true, email: true } },
} satisfies Prisma.AlertInclude;

export type AlertWithContext = Prisma.AlertGetPayload<{ include: typeof alertInclude }>;

function buildWhere(query: ListAlertsQuery): Prisma.AlertWhereInput {
  const where: Prisma.AlertWhereInput = {};
  if (query.severity) where.severity = query.severity;
  if (query.isRead !== undefined) where.isRead = query.isRead;
  if (query.hotspotId) where.hotspotId = query.hotspotId;
  if (query.from || query.to) {
    where.createdAt = {
      ...(query.from ? { gte: query.from } : {}),
      ...(query.to ? { lte: query.to } : {}),
    };
  }
  return where;
}

export async function listAlerts(query: ListAlertsQuery): Promise<{
  items: AlertWithContext[];
  total: number;
  unreadCount: number;
}> {
  const where = buildWhere(query);

  const [items, total, unreadCount] = await Promise.all([
    prisma.alert.findMany({
      where,
      include: alertInclude,
      orderBy: { createdAt: query.sortOrder },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.alert.count({ where }),
    prisma.alert.count({ where: { isRead: false } }),
  ]);

  return { items, total, unreadCount };
}

export async function getAlertById(id: string): Promise<AlertWithContext> {
  const alert = await prisma.alert.findUnique({ where: { id }, include: alertInclude });
  if (!alert) throw ApiError.notFound(`Alert ${id} not found`);
  return alert;
}

export async function markAlertRead(id: string, userId?: string): Promise<AlertWithContext> {
  const existing = await prisma.alert.findUnique({ where: { id }, select: { id: true, isRead: true } });
  if (!existing) throw ApiError.notFound(`Alert ${id} not found`);

  return prisma.alert.update({
    where: { id },
    data: {
      isRead: true,
      acknowledgedAt: existing.isRead ? undefined : new Date(),
      acknowledgedById: existing.isRead ? undefined : (userId ?? null),
    },
    include: alertInclude,
  });
}

export async function markAllAlertsRead(userId?: string): Promise<number> {
  const result = await prisma.alert.updateMany({
    where: { isRead: false },
    data: { isRead: true, acknowledgedAt: new Date(), acknowledgedById: userId ?? null },
  });
  return result.count;
}

export async function getUnreadCount(): Promise<{ total: number; bySeverity: Record<Severity, number> }> {
  const grouped = await prisma.alert.groupBy({
    by: ['severity'],
    where: { isRead: false },
    _count: { _all: true },
  });

  const bySeverity: Record<Severity, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
  let total = 0;
  for (const row of grouped) {
    bySeverity[row.severity] = row._count._all;
    total += row._count._all;
  }

  return { total, bySeverity };
}

export async function createAlert(input: CreateAlertInput): Promise<AlertWithContext> {
  if (input.hotspotId) {
    const hotspot = await prisma.hotspot.findUnique({ where: { id: input.hotspotId }, select: { id: true } });
    if (!hotspot) throw ApiError.badRequest(`Hotspot ${input.hotspotId} does not exist`);
  }
  return prisma.alert.create({ data: input, include: alertInclude });
}

/**
 * How long the same alert title is suppressed after being raised.
 *
 * A flare stack is re-detected on every satellite pass, so without this a
 * single persistent source would produce dozens of identical alerts and bury
 * the one-off industrial fire an analyst actually needs to see.
 */
const ALERT_SUPPRESSION_HOURS = 72;

/**
 * Raises an alert for a hotspot the ingest pipeline flagged as significant.
 *
 * De-duplicates on title within the suppression window rather than on hotspot
 * id: each satellite pass creates a *new* hotspot row for the same physical
 * source, so keying on hotspot id would suppress nothing.
 *
 * The `referenceTime` parameter lets the seeder replay historical days without
 * every alert collapsing into a single "now" window.
 */
export async function raiseAlertForHotspot(params: {
  hotspotId: string;
  title: string;
  message: string;
  severity: Severity;
  referenceTime?: Date;
}): Promise<AlertWithContext | null> {
  const now = params.referenceTime ?? new Date();
  const since = new Date(now.getTime() - ALERT_SUPPRESSION_HOURS * 3_600_000);

  const duplicate = await prisma.alert.findFirst({
    where: {
      title: params.title,
      createdAt: { gte: since, lte: now },
    },
    select: { id: true },
  });
  if (duplicate) return null;

  return prisma.alert.create({
    data: {
      hotspotId: params.hotspotId,
      title: params.title,
      message: params.message,
      severity: params.severity,
      createdAt: now,
      updatedAt: now,
    },
    include: alertInclude,
  });
}

export async function getRecentAlerts(limit = 5): Promise<AlertWithContext[]> {
  return prisma.alert.findMany({
    include: alertInclude,
    orderBy: [{ isRead: 'asc' }, { createdAt: 'desc' }],
    take: limit,
  });
}
