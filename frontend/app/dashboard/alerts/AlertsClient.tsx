'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Header } from '@/components/layout/Header';
import { Button, SegmentedControl } from '@/components/ui/Button';
import {
  AlertStatusBadge,
  Caveat,
  ClassBadge,
  LiveIndicator,
  ProvenanceBadge,
  RiskBadge,
} from '@/components/ui/Indicators';
import { Panel, PanelBody, PanelHeader } from '@/components/ui/Panel';
import { StatCard, StatRow } from '@/components/ui/StatCard';
import { EmptyState, ErrorState, LoadingState, NoticeBanner } from '@/components/ui/States';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/hooks/useAuth';
import { useRealtime } from '@/hooks/useRealtime';
import { useTheme } from '@/hooks/useTheme';
import { useNavOpener } from '../DashboardShell';
import { describeError } from '@/lib/api';
import { DISCLAIMERS, riskColor } from '@/lib/constants';
import { formatDateTime, formatRelativeTime, shortId } from '@/lib/format';
import { alertService } from '@/services';
import type { Alert, AlertStatus, RiskLevel, Severity } from '@/types';

const SEVERITY_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'CRITICAL', label: 'Critical' },
  { value: 'HIGH', label: 'High' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'LOW', label: 'Low' },
] as const;

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'OPEN', label: 'Open' },
  { value: 'ACKNOWLEDGED', label: 'Ack' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'DISMISSED', label: 'Dismissed' },
] as const;

/**
 * Alert register with live push and triage.
 *
 * Alerts arriving over Socket.io are merged into the fetched list rather than
 * triggering a refetch, so the feed updates instantly without a round trip and
 * without losing the analyst's scroll position or filter state.
 */
export function AlertsClient() {
  const openNav = useNavOpener();
  const { hasRole } = useAuth();
  const { connected, liveAlerts, markSeen } = useRealtime();
  const { theme } = useTheme();

  const [severity, setSeverity] = useState<string>('all');
  const [status, setStatus] = useState<string>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const query = useMemo(
    () => ({
      pageSize: 60,
      severity: severity === 'all' ? undefined : (severity as Severity),
      status: status === 'all' ? undefined : (status as AlertStatus),
    }),
    [severity, status],
  );

  const alerts = useApi(() => alertService.list(query), [JSON.stringify(query)]);
  const counts = useApi(() => alertService.statusCounts(), []);
  const unread = useApi(() => alertService.unreadCount(), []);

  // Opening this page is an explicit "I have seen these".
  useEffect(() => {
    markSeen();
  }, [markSeen]);

  /**
   * Fetched list merged with anything pushed since. Pushed alerts are
   * prepended and de-duplicated by id, and the active filters are applied to
   * them too so a live CRITICAL does not appear while "LOW only" is selected.
   */
  const rows = useMemo<Alert[]>(() => {
    const fetched = alerts.data?.items ?? [];
    const known = new Set(fetched.map((alert) => alert.id));

    const pushed = liveAlerts.filter((alert) => {
      if (known.has(alert.id)) return false;
      if (query.severity && alert.severity !== query.severity) return false;
      if (query.status && alert.status !== query.status) return false;
      return true;
    });

    return [...pushed, ...fetched];
  }, [alerts.data, liveAlerts, query.severity, query.status]);

  const canTriage = hasRole('ADMIN', 'ANALYST');

  async function act(id: string, action: 'acknowledge' | AlertStatus) {
    setBusyId(id);
    setActionError(null);
    try {
      if (action === 'acknowledge') await alertService.acknowledge(id);
      else await alertService.setStatus(id, action);
      alerts.refetch();
      counts.refetch();
      unread.refetch();
    } catch (error) {
      setActionError(describeError(error));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <Header
        title="Alert register"
        subtitle={`${counts.data?.OPEN ?? 0} open · live push ${connected ? 'connected' : 'offline'}`}
        onOpenNav={openNav}
        actions={<LiveIndicator connected={connected} />}
      />

      <div className="flex-1 overflow-y-auto">
        <StatRow className="border-b border-line">
          <StatCard label="Open" value={counts.data?.OPEN ?? 0} accent="rust" footnote="awaiting triage" />
          <StatCard label="Acknowledged" value={counts.data?.ACKNOWLEDGED ?? 0} accent="warn" />
          <StatCard label="Resolved" value={counts.data?.RESOLVED ?? 0} accent="sage" />
          <StatCard label="Unread" value={unread.data?.total ?? 0} accent="neutral" />
        </StatRow>

        <div className="p-3">
          <NoticeBanner label="Scope" tone="danger" className="mb-3">
            {DISCLAIMERS.decisionSupport}. Alerts are raised automatically when a detection scores
            HIGH or above, or when the model reports a high-confidence industrial signature.
            Acknowledging an alert records your name against it for audit; it does not notify any
            external agency.
          </NoticeBanner>

          {actionError ? <ErrorState message={actionError} className="mb-3" /> : null}

          <Panel>
            <PanelHeader
              label="Alerts"
              meta={`${rows.length} shown`}
              actions={
                <div className="flex flex-wrap items-center gap-1.5">
                  <SegmentedControl
                    options={STATUS_FILTERS.map((option) => ({
                      value: option.value,
                      label: option.label,
                      count:
                        option.value === 'all'
                          ? undefined
                          : (counts.data?.[option.value as AlertStatus] ?? 0),
                    }))}
                    value={status}
                    onChange={setStatus}
                  />
                  <SegmentedControl
                    options={SEVERITY_FILTERS.map((option) => ({
                      value: option.value,
                      label: option.label,
                      // Resolved per theme rather than baked into the array.
                      color: option.value === 'all' ? undefined : riskColor(option.value as RiskLevel, theme),
                    }))}
                    value={severity}
                    onChange={setSeverity}
                  />
                </div>
              }
            />

            {alerts.loading && !alerts.data ? (
              <LoadingState label="Loading alerts" />
            ) : alerts.error ? (
              <div className="p-3">
                <ErrorState message={alerts.error} onRetry={alerts.refetch} />
              </div>
            ) : rows.length === 0 ? (
              <EmptyState
                title="No alerts match these filters"
                detail={
                  connected
                    ? 'The live stream is connected — new alerts will appear here automatically.'
                    : 'The live stream is not connected, so this list will not update on its own.'
                }
              />
            ) : (
              <ul className="divide-y divide-line">
                {rows.map((alert) => (
                  <li key={alert.id} className="px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <RiskBadge level={alert.severity} />
                      <AlertStatusBadge status={alert.status} />
                      {alert.hotspot?.mlClass ? (
                        <ClassBadge thermalClass={alert.hotspot.mlClass} compact />
                      ) : null}
                      {alert.hotspot ? (
                        <ProvenanceBadge
                          path={alert.hotspot.classificationPath}
                          confidence={alert.hotspot.mlConfidence}
                        />
                      ) : null}

                      <span
                        className="tims-data ml-auto flex-none text-[10px] text-fg-subtle"
                        title={formatDateTime(alert.createdAt)}
                      >
                        {formatRelativeTime(alert.createdAt)}
                      </span>
                    </div>

                    <p className="mt-1.5 text-[12px] font-medium leading-snug text-fg">
                      {alert.title}
                    </p>
                    <p className="mt-1 text-[11px] leading-relaxed text-fg-muted">{alert.message}</p>

                    {alert.reasons.length > 0 ? (
                      <ul className="mt-1.5 space-y-0.5">
                        {alert.reasons.slice(0, 3).map((reason, index) => (
                          <li
                            key={`${index}-${reason}`}
                            className="border-l-2 border-l-line-strong pl-2 text-[10px] leading-snug text-fg-subtle"
                          >
                            {reason}
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {alert.hotspotId ? (
                        <Link
                          href={`/dashboard/hotspots/${alert.hotspotId}`}
                          // One row can be one of sixty; prefetching every
                          // detail route would fire sixty RSC requests that
                          // mostly abort unused.
                          prefetch={false}
                          className="tims-nav-item tims-data border border-line px-2 py-0.5 text-[10px] text-fg-muted hover:text-fg"
                        >
                          Investigate →
                        </Link>
                      ) : null}

                      {canTriage && alert.status === 'OPEN' ? (
                        <Button
                          size="sm"
                          variant="primary"
                          disabled={busyId === alert.id}
                          onClick={() => void act(alert.id, 'acknowledge')}
                        >
                          {busyId === alert.id ? 'Working…' : 'Acknowledge'}
                        </Button>
                      ) : null}

                      {canTriage && alert.status === 'ACKNOWLEDGED' ? (
                        <>
                          <Button
                            size="sm"
                            disabled={busyId === alert.id}
                            onClick={() => void act(alert.id, 'RESOLVED')}
                          >
                            Resolve
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busyId === alert.id}
                            onClick={() => void act(alert.id, 'DISMISSED')}
                          >
                            Dismiss
                          </Button>
                        </>
                      ) : null}

                      {alert.acknowledgedBy ? (
                        <span className="tims-data text-[10px] text-fg-subtle">
                          {alert.status === 'RESOLVED' ? 'resolved' : 'ack'} by{' '}
                          {alert.acknowledgedBy.email}
                        </span>
                      ) : null}

                      <span className="tims-data ml-auto text-[10px] text-fg-subtle">
                        {shortId(alert.id)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel className="mt-3">
            <PanelHeader label="Alert rules" />
            <PanelBody>
              <ul className="space-y-1 text-[11px] leading-relaxed text-fg-muted">
                <li>
                  Risk level <span className="tims-data text-fg">HIGH</span> (61+) or{' '}
                  <span className="tims-data text-fg">CRITICAL</span> (81+) raises an alert.
                </li>
                <li>
                  A model classification of possible industrial fire or persistent thermal source at{' '}
                  <span className="tims-data text-fg">≥ 75%</span> confidence also raises one. A rule
                  fallback never counts as high confidence, because it has no calibrated probability.
                </li>
                <li>
                  Identical titles are suppressed for 72 hours, so a source re-detected on every
                  satellite pass does not bury a one-off incident.
                </li>
              </ul>
              <Caveat className="mt-2">{DISCLAIMERS.risk}</Caveat>
            </PanelBody>
          </Panel>
        </div>
      </div>
    </>
  );
}
