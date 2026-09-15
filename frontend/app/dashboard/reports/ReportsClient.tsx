'use client';

import { useState } from 'react';
import { Header } from '@/components/layout/Header';
import { Button, SegmentedControl } from '@/components/ui/Button';
import { Caveat, Status } from '@/components/ui/Indicators';
import { Panel, PanelBody, PanelHeader, Readout, ReadoutList } from '@/components/ui/Panel';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/hooks/useAuth';
import { useStaggerIn } from '@/hooks/useGsap';
import { useNavOpener } from '../DashboardShell';
import { describeError } from '@/lib/api';
import { DISCLAIMERS } from '@/lib/constants';
import { formatDate, formatDateTime, shortId } from '@/lib/format';
import { reportService } from '@/services';
import type { Report, ReportStatus } from '@/types';

const KINDS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'custom', label: 'Custom' },
] as const;

const STATUS_COLOR: Record<ReportStatus, string> = {
  READY: '#6b9e7a',
  QUEUED: '#9a8c5a',
  FAILED: '#c1502e',
};

/**
 * Situation report generation and history.
 *
 * A report is a snapshot built from real stored rows at the moment it is
 * requested. Re-scoring a hotspot later does not rewrite a report already
 * issued, which is what makes the history auditable.
 */
export function ReportsClient() {
  const openNav = useNavOpener();
  const containerRef = useStaggerIn();
  const { hasRole } = useAuth();

  const [kind, setKind] = useState<string>('daily');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Report | null>(null);
  const [page, setPage] = useState(1);

  const reports = useApi(() => reportService.list({ page, pageSize: 25 }), [page]);

  const canGenerate = hasRole('ADMIN', 'ANALYST');

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const report = await reportService.generate({
        kind: kind as 'daily' | 'weekly' | 'custom',
      });
      setSelected(report);
      reports.refetch();
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Header
        title="Situation reports"
        subtitle={`${reports.data?.meta.total ?? 0} reports on record`}
        onOpenNav={openNav}
      />

      <div ref={containerRef} className="flex-1 overflow-y-auto p-3">
        <div className="grid gap-3 xl:grid-cols-[1fr_360px]">
          <div className="space-y-3">
            {/* --- Generate ------------------------------------------ */}
            <Panel className="tims-enter">
              <PanelHeader label="Generate" title="New situation report" />
              <PanelBody className="space-y-2.5">
                {error ? <ErrorState message={error} /> : null}

                <div className="flex flex-wrap items-center gap-2">
                  <SegmentedControl
                    options={KINDS.map((option) => ({ value: option.value, label: option.label }))}
                    value={kind}
                    onChange={setKind}
                  />
                  <Button
                    variant="primary"
                    disabled={busy || !canGenerate}
                    onClick={() => void generate()}
                  >
                    {busy ? 'Generating…' : 'Generate'}
                  </Button>
                </div>

                {!canGenerate ? (
                  <Caveat>
                    Report generation requires an ANALYST or ADMIN role. Your account is read-only.
                  </Caveat>
                ) : (
                  <p className="text-[11px] leading-relaxed text-fg-muted">
                    A daily report covers the last 24 hours, a weekly report the last 7 days. Incident
                    reports are generated from a hotspot&rsquo;s investigation page.
                  </p>
                )}
              </PanelBody>
            </Panel>

            {/* --- History ------------------------------------------ */}
            <Panel className="tims-enter">
              <PanelHeader label="History" meta={`${reports.data?.meta.total ?? 0} total`} />

              {reports.loading && !reports.data ? (
                <LoadingState label="Loading reports" />
              ) : reports.error ? (
                <div className="p-3">
                  <ErrorState message={reports.error} onRetry={reports.refetch} />
                </div>
              ) : (reports.data?.items.length ?? 0) === 0 ? (
                <EmptyState
                  title="No reports generated yet"
                  detail="Generate a daily or weekly situation report, or produce an incident report from a hotspot investigation."
                />
              ) : (
                <ul className="divide-y divide-line">
                  {reports.data?.items.map((report) => (
                    <li key={report.id}>
                      <button
                        type="button"
                        onClick={() => setSelected(report)}
                        className="tims-row block w-full px-3 py-2 text-left"
                      >
                        <div className="flex items-center gap-2">
                          <Status color={STATUS_COLOR[report.status]}>{report.status}</Status>
                          <span className="tims-data text-[10px] text-fg-subtle">{report.kind}</span>
                          <span className="tims-data ml-auto text-[10px] text-fg-subtle">
                            {formatDateTime(report.createdAt)}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-[12px] text-fg">{report.title}</p>
                        <p className="tims-data mt-0.5 text-[10px] text-fg-subtle">
                          {report.hotspotCount} detections · {report.alertCount} alerts ·{' '}
                          {report.requestedBy?.email ?? 'system'}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {reports.data?.meta && reports.data.meta.totalPages > 1 ? (
                <div className="flex items-center justify-between border-t border-line px-3 py-2">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((value) => value - 1)}
                    className="tims-nav-item tims-data border border-line px-2 py-1 text-[11px] text-fg-muted disabled:opacity-35"
                  >
                    ← Prev
                  </button>
                  <span className="tims-data text-[11px] text-fg-subtle">
                    {page} / {reports.data.meta.totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={page >= reports.data.meta.totalPages}
                    onClick={() => setPage((value) => value + 1)}
                    className="tims-nav-item tims-data border border-line px-2 py-1 text-[11px] text-fg-muted disabled:opacity-35"
                  >
                    Next →
                  </button>
                </div>
              ) : null}
            </Panel>
          </div>

          {/* --- Selected report -------------------------------------- */}
          <Panel className="tims-enter h-fit">
            <PanelHeader
              label="Report detail"
              meta={selected ? shortId(selected.id) : undefined}
            />
            <PanelBody>
              {!selected ? (
                <p className="py-6 text-center text-[11px] text-fg-subtle">
                  Select a report to view its contents.
                </p>
              ) : (
                <div className="space-y-3">
                  <div>
                    <p className="text-[12px] font-medium text-fg">{selected.title}</p>
                    <p className="tims-data mt-0.5 text-[10px] text-fg-subtle">
                      {formatDate(selected.periodStart)} → {formatDate(selected.periodEnd)}
                    </p>
                  </div>

                  <ReadoutList>
                    <Readout label="Status" value={selected.status} />
                    <Readout label="Kind" value={selected.kind} />
                    <Readout label="Detections" value={String(selected.hotspotCount)} />
                    <Readout label="Alerts" value={String(selected.alertCount)} />
                    <Readout
                      label="Requested by"
                      value={selected.requestedBy?.email ?? 'system'}
                      mono={false}
                    />
                    <Readout label="Generated" value={formatDateTime(selected.completedAt)} mono={false} />
                  </ReadoutList>

                  {selected.error ? <ErrorState message={selected.error} /> : null}

                  {selected.summary ? (
                    <div>
                      <p className="tims-label mb-1">Snapshot</p>
                      {/* Rendered as JSON rather than a bespoke layout: the
                          summary shape differs between incident and period
                          reports, and a wrong-shaped renderer would hide
                          fields rather than show them. */}
                      <pre className="tims-data max-h-[360px] overflow-auto border border-line bg-surface-2 p-2 text-[10px] leading-relaxed text-fg-muted">
                        {JSON.stringify(selected.summary, null, 2)}
                      </pre>
                    </div>
                  ) : null}

                  <Caveat>{DISCLAIMERS.decisionSupport}</Caveat>
                </div>
              )}
            </PanelBody>
          </Panel>
        </div>
      </div>
    </>
  );
}
