import { prisma } from '../config/prisma';
import { Prisma } from '../generated/prisma/client';
import type { AlertStatus, Severity } from '../generated/prisma/enums';
import { emitAlertAcknowledged, emitNewAlert } from '../realtime';
import { ApiError } from '../utils/ApiError';
import { createLogger } from '../utils/logger';
import type { CreateAlertInput, ListAlertsQuery } from '../validators/alert.schema';

const log = createLogger('alerts');

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
      mlClass: true,
      mlConfidence: true,
      classificationPath: true,
      inBhopalBoundary: true,
      industrialFacility: { select: { id: true, name: true, location: true, type: true } },
    },
  },
  acknowledgedBy: { select: { id: true, name: true, email: true } },
} satisfies Prisma.AlertInclude;

export type AlertWithContext = Prisma.AlertGetPayload<{ include: typeof alertInclude }>;

function buildWhere(query: ListAlertsQuery): Prisma.AlertWhereInput {
  const where: Prisma.AlertWhereInput = {};
  if (query.severity) where.severity = query.severity;
  if (query.status) where.status = query.status;
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

  const alert = await prisma.alert.create({ data: input, include: alertInclude });

  // Analyst-created alerts push live too. Previously only the ingest path
  // emitted, so an alert raised by hand appeared for its author but not on any
  // other open dashboard until a manual refresh - which defeats the point of
  // having a realtime channel at all.
  emitNewAlert(alert);

  return alert;
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
  /** Risk drivers captured at alert time so later re-scoring cannot rewrite them. */
  reasons?: string[];
  referenceTime?: Date;
  /**
   * Whether to push this alert over Socket.io.
   *
   * Suppressed while replaying a historical backlog: pushing hundreds of
   * archive alerts would flood every connected dashboard with events that are
   * months old and are not live incidents.
   */
  push?: boolean;
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

  const alert = await prisma.alert.create({
    data: {
      hotspotId: params.hotspotId,
      title: params.title,
      message: params.message,
      severity: params.severity,
      reasons: params.reasons ?? [],
      status: 'OPEN',
      createdAt: now,
      updatedAt: now,
    },
    include: alertInclude,
  });

  if (params.push !== false) emitNewAlert(alert);

  return alert;
}

// ---------------------------------------------------------------------------
// Triage
// ---------------------------------------------------------------------------

/**
 * Acknowledges an alert: an analyst has seen it and taken ownership.
 *
 * Distinct from `markAlertRead`, which only clears the notification bell.
 * Acknowledgement is an auditable triage action, so it records who and when and
 * broadcasts the change to every other open dashboard.
 */
export async function acknowledgeAlert(
  id: string,
  userId: string,
  note?: string,
): Promise<AlertWithContext> {
  const existing = await prisma.alert.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!existing) throw ApiError.notFound(`Alert ${id} not found`);

  if (existing.status === 'ACKNOWLEDGED' || existing.status === 'RESOLVED') {
    throw ApiError.badRequest(`Alert ${id} is already ${existing.status.toLowerCase()}`);
  }

  const alert = await prisma.alert.update({
    where: { id },
    data: {
      status: 'ACKNOWLEDGED',
      isRead: true,
      acknowledgedAt: new Date(),
      acknowledgedById: userId,
      resolutionNote: note ?? undefined,
    },
    include: alertInclude,
  });

  log.info('Alert acknowledged', { id, userId });
  emitAlertAcknowledged(alert);
  return alert;
}

/** Closes out an alert. RESOLVED means handled; DISMISSED means not actionable. */
export async function setAlertStatus(
  id: string,
  status: AlertStatus,
  userId: string,
  note?: string,
): Promise<AlertWithContext> {
  const existing = await prisma.alert.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw ApiError.notFound(`Alert ${id} not found`);

  const terminal = status === 'RESOLVED' || status === 'DISMISSED';

  const alert = await prisma.alert.update({
    where: { id },
    data: {
      status,
      isRead: true,
      resolutionNote: note ?? undefined,
      resolvedAt: terminal ? new Date() : null,
      acknowledgedById: userId,
      acknowledgedAt: new Date(),
    },
    include: alertInclude,
  });

  log.info('Alert status changed', { id, status, userId });
  emitAlertAcknowledged(alert);
  return alert;
}

/** Counts by triage status, for the alerts page filter chips. */
export async function getStatusCounts(): Promise<Record<AlertStatus, number>> {
  const grouped = await prisma.alert.groupBy({ by: ['status'], _count: { _all: true } });
  const counts: Record<AlertStatus, number> = {
    OPEN: 0,
    ACKNOWLEDGED: 0,
    RESOLVED: 0,
    DISMISSED: 0,
  };
  for (const row of grouped) counts[row.status] = row._count._all;
  return counts;
}

export async function getRecentAlerts(limit = 5): Promise<AlertWithContext[]> {
  return prisma.alert.findMany({
    include: alertInclude,
    orderBy: [{ isRead: 'asc' }, { createdAt: 'desc' }],
    take: limit,
  });
}
