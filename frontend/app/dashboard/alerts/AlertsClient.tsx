'use client';

import { BellOff, CheckCheck } from 'lucide-react';
import { useState } from 'react';
import { AlertCard } from '@/components/alerts/AlertCard';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { useApi } from '@/hooks/useApi';
import { RISK_LEVELS, RISK_META } from '@/lib/constants';
import { describeError } from '@/lib/api';
import { formatNumber } from '@/lib/format';
import { alertService, type AlertFilters } from '@/services/alert.service';
import type { Severity } from '@/types';

type ReadFilter = 'all' | 'unread' | 'read';

export function AlertsClient() {
  const [severity, setSeverity] = useState<Severity | null>(null);
  const [readFilter, setReadFilter] = useState<ReadFilter>('all');
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const filters: AlertFilters = {
    page,
    pageSize: 20,
    severity: severity ?? undefined,
    isRead: readFilter === 'all' ? undefined : readFilter === 'read',
  };

  const alerts = useApi(() => alertService.list(filters), [JSON.stringify(filters)]);
  const counts = useApi(() => alertService.unreadCount(), []);

  async function markRead(id: string) {
    setBusyId(id);
    setActionError(null);
    try {
      await alertService.markRead(id);
      alerts.refetch();
      counts.refetch();
    } catch (error) {
      setActionError(describeError(error));
    } finally {
      setBusyId(null);
    }
  }

  async function markAllRead() {
    setBusyId('all');
    setActionError(null);
    try {
      await alertService.markAllRead();
      alerts.refetch();
      counts.refetch();
    } catch (error) {
      setActionError(describeError(error));
    } finally {
      setBusyId(null);
    }
  }

  const unreadTotal = counts.data?.total ?? 0;

  return (
    <div className="space-y-4">
      {/* --- Severity summary -------------------------------------------------- */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {RISK_LEVELS.map((level) => {
          const count = counts.data?.bySeverity[level] ?? 0;
          const active = severity === level;
          return (
            <button
              key={level}
              type="button"
              onClick={() => {
                setSeverity(active ? null : level);
                setPage(1);
              }}
              aria-pressed={active}
              className="rounded-xl border bg-surface px-4 py-3 text-left transition-colors"
              style={{
                borderColor: active ? RISK_META[level].color : 'var(--tims-border)',
                backgroundColor: active ? `${RISK_META[level].color}0f` : undefined,
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-xs font-medium text-fg-muted">
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: RISK_META[level].color }}
                    aria-hidden
                  />
                  {RISK_META[level].label}
                </span>
                <span className="tims-data text-lg font-semibold text-fg">{formatNumber(count)}</span>
              </div>
              <p className="mt-1 text-[10px] text-fg-subtle">unread</p>
            </button>
          );
        })}
      </div>

      {/* --- Toolbar ------------------------------------------------------------ */}
      <Card>
        <div className="flex flex-wrap items-center gap-3 p-3">
          <div className="inline-flex rounded-lg border border-line bg-surface-2 p-0.5">
            {(['all', 'unread', 'read'] as ReadFilter[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  setReadFilter(option);
                  setPage(1);
                }}
                aria-pressed={readFilter === option}
                className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors ${
                  readFilter === option ? 'bg-primary/12 text-primary' : 'text-fg-muted hover:text-fg'
                }`}
              >
                {option}
              </button>
            ))}
          </div>

          {severity ? (
            <button
              type="button"
              onClick={() => setSeverity(null)}
              className="text-xs text-primary hover:underline"
            >
              Clear severity filter
            </button>
          ) : null}

          <Button
            variant="secondary"
            size="sm"
            onClick={markAllRead}
            disabled={unreadTotal === 0}
            loading={busyId === 'all'}
            className="ml-auto"
          >
            <CheckCheck className="size-3.5" aria-hidden />
            Mark all read
          </Button>
        </div>
      </Card>

      {actionError ? (
        <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-500 ring-1 ring-inset ring-red-500/25">
          {actionError}
        </p>
      ) : null}

      {/* --- Feed ---------------------------------------------------------------- */}
      {alerts.loading && !alerts.data ? (
        <Card>
          <LoadingState label="Loading alerts" minHeight={300} />
        </Card>
      ) : alerts.error ? (
        <Card>
          <ErrorState message={alerts.error} onRetry={alerts.refetch} />
        </Card>
      ) : (alerts.data?.items.length ?? 0) === 0 ? (
        <Card>
          <EmptyState
            icon={BellOff}
            title={readFilter === 'unread' ? 'No unread alerts' : 'No alerts to show'}
            description="Alerts are raised automatically when a detection crosses the critical risk threshold or a persistent industrial source is confirmed."
            minHeight={280}
          />
        </Card>
      ) : (
        <div className="space-y-2.5">
          {(alerts.data?.items ?? []).map((alert) => (
            <AlertCard key={alert.id} alert={alert} onMarkRead={markRead} busy={busyId === alert.id} />
          ))}
        </div>
      )}

      {/* --- Pagination ----------------------------------------------------------- */}
      {alerts.data && alerts.data.meta.totalPages > 1 ? (
        <Card>
          <CardBody className="flex items-center justify-between py-3 text-xs text-fg-muted">
            <span className="tims-data">
              Page {alerts.data.meta.page} of {alerts.data.meta.totalPages} · {formatNumber(alerts.data.meta.total)}{' '}
              alerts
            </span>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                disabled={!alerts.data.meta.hasPreviousPage}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((value) => value + 1)}
                disabled={!alerts.data.meta.hasNextPage}
              >
                Next
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
