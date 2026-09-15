'use client';

import { Header } from '@/components/layout/Header';
import { Caveat, Status } from '@/components/ui/Indicators';
import { Panel, PanelBody, PanelHeader, Readout, ReadoutList } from '@/components/ui/Panel';
import { StatCard, StatRow } from '@/components/ui/StatCard';
import { ErrorState, LoadingState, NoticeBanner } from '@/components/ui/States';
import { useApi } from '@/hooks/useApi';
import { useStaggerIn } from '@/hooks/useGsap';
import { useNavOpener } from '../DashboardShell';
import { BHOPAL_BOUNDARY, PILOT } from '@/lib/bhopal';
import { formatDateTime } from '@/lib/format';
import { bhopalService } from '@/services';
import type { DataSourceStatus } from '@/types';

/**
 * Data source transparency page (brief section 17).
 *
 * Lists every upstream source with its real status, including the ones that are
 * NOT wired up. An honest "credentials required" is the point: a reviewer
 * should be able to see exactly which claims are backed by live data and which
 * are not, rather than having to infer it.
 */

const STATUS_META: Record<DataSourceStatus, { label: string; color: string; note: string }> = {
  LIVE: { label: 'Live', color: '#6b9e7a', note: 'TIMS is actively pulling from this source.' },
  CREDENTIALS_REQUIRED: {
    label: 'Credentials required',
    color: '#b57340',
    note: 'A provider interface exists but no credentials are configured, so nothing is ingested.',
  },
  UNAVAILABLE: {
    label: 'Unavailable',
    color: '#c1502e',
    note: 'No machine-readable feed is available, so no data from this source is loaded.',
  },
  DEMO: { label: 'Demo', color: '#9a8c5a', note: 'Serving clearly-labelled sample data.' },
};

export function SourcesClient() {
  const openNav = useNavOpener();
  const containerRef = useStaggerIn();

  const sources = useApi(() => bhopalService.dataSources(), []);
  const boundary = useApi(() => bhopalService.boundary(), []);

  const data = sources.data;
  const live = data?.sources.filter((source) => source.status === 'LIVE').length ?? 0;
  const government = data?.sources.filter((source) => source.isGovernment).length ?? 0;

  return (
    <>
      <Header
        title="Data sources"
        subtitle="Provenance, licensing and real operational status"
        onOpenNav={openNav}
      />

      <div ref={containerRef} className="flex-1 overflow-y-auto">
        <StatRow className="border-b border-line">
          <StatCard label="Sources registered" value={data?.sources.length ?? 0} accent="neutral" />
          <StatCard label="Live" value={live} accent="sage" footnote="actively ingesting" />
          <StatCard
            label="Government sources"
            value={government}
            accent="rust"
            footnote="verified operators"
          />
          <StatCard
            label="Records held"
            value={
              (data?.recordCounts.hotspots ?? 0) +
              (data?.recordCounts.industrialFacilities ?? 0) +
              (data?.recordCounts.emergencyFacilities ?? 0)
            }
            accent="warn"
            footnote="all from real API calls"
          />
        </StatRow>

        <div className="space-y-3 p-3">
          {data?.disclaimer ? (
            <NoticeBanner label="Scope" tone="danger" className="tims-enter">
              {data.disclaimer}
            </NoticeBanner>
          ) : null}

          {sources.loading && !data ? (
            <LoadingState label="Loading source register" />
          ) : sources.error ? (
            <ErrorState message={sources.error} onRetry={sources.refetch} />
          ) : (
            <>
              {/* --- Source table ---------------------------------- */}
              <Panel className="tims-enter">
                <PanelHeader label="Source register" title="Every upstream source" />
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="border-b border-line">
                        {['Source', 'Purpose', 'Status', 'Update frequency', 'Licence'].map(
                          (header) => (
                            <th key={header} className="bg-surface-2 px-2.5 py-1.5">
                              <span className="tims-label">{header}</span>
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {data?.sources.map((source) => {
                        const meta = STATUS_META[source.status];
                        return (
                          <tr key={source.id} className="tims-row border-b border-line/70 align-top">
                            <td className="px-2.5 py-2">
                              <div className="flex items-start gap-1.5">
                                {source.isGovernment ? (
                                  <span
                                    className="tims-data mt-[2px] flex-none border border-line-strong px-1 text-[9px] text-fg-subtle"
                                    title="Operated by a verified government body"
                                  >
                                    GOV
                                  </span>
                                ) : null}
                                <span className="min-w-0">
                                  <span className="block text-[12px] text-fg">{source.name}</span>
                                  {source.officialUrl ? (
                                    <a
                                      href={source.officialUrl}
                                      target="_blank"
                                      rel="noreferrer noopener"
                                      className="tims-data block truncate text-[10px] text-fg-subtle underline-offset-2 hover:text-fg hover:underline"
                                    >
                                      {source.officialUrl}
                                    </a>
                                  ) : null}
                                </span>
                              </div>
                            </td>

                            <td className="max-w-[260px] px-2.5 py-2">
                              <span className="block text-[11px] leading-snug text-fg-muted">
                                {source.purpose}
                              </span>
                              {source.statusNote ? (
                                <span className="mt-1 block border-l-2 border-l-line-strong pl-2 text-[10px] leading-snug text-fg-subtle">
                                  {source.statusNote}
                                </span>
                              ) : null}
                            </td>

                            <td className="px-2.5 py-2">
                              <Status color={meta.color} title={meta.note}>
                                {meta.label}
                              </Status>
                            </td>

                            <td className="px-2.5 py-2">
                              <span className="tims-data text-[10px] text-fg-muted">
                                {source.updateFrequency ?? '—'}
                              </span>
                            </td>

                            <td className="px-2.5 py-2">
                              <span className="block text-[10px] text-fg-muted">
                                {source.license ?? '—'}
                              </span>
                              {source.attribution ? (
                                <span className="mt-0.5 block text-[10px] text-fg-subtle">
                                  {source.attribution}
                                </span>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Panel>

              <div className="grid gap-3 lg:grid-cols-3">
                {/* --- Record counts ------------------------------ */}
                <Panel className="tims-enter">
                  <PanelHeader label="Records held" />
                  <PanelBody className="py-1">
                    <ReadoutList>
                      <Readout
                        label="Thermal detections"
                        value={(data?.recordCounts.hotspots ?? 0).toLocaleString('en-IN')}
                      />
                      <Readout
                        label="Industrial facilities"
                        value={(data?.recordCounts.industrialFacilities ?? 0).toLocaleString('en-IN')}
                      />
                      <Readout
                        label="Emergency facilities"
                        value={(data?.recordCounts.emergencyFacilities ?? 0).toLocaleString('en-IN')}
                      />
                      <Readout
                        label="Boundaries"
                        value={String(data?.recordCounts.administrativeBoundaries ?? 0)}
                      />
                      <Readout
                        label="Weather observations"
                        value={(data?.recordCounts.weatherObservations ?? 0).toLocaleString('en-IN')}
                      />
                    </ReadoutList>
                    <Caveat className="mt-2">
                      Counts are read live from PostgreSQL, so a &ldquo;Live&rdquo; status can be
                      checked against data that actually exists rather than taken on trust.
                    </Caveat>
                  </PanelBody>
                </Panel>

                {/* --- Capabilities ------------------------------- */}
                <Panel className="tims-enter">
                  <PanelHeader label="System capabilities" />
                  <PanelBody className="py-1">
                    <ReadoutList>
                      <Readout
                        label="PostGIS"
                        value={
                          data?.capabilities.postgis.available
                            ? (data.capabilities.postgis.version ?? 'available')
                            : 'unavailable'
                        }
                      />
                      <Readout
                        label="FIRMS key"
                        value={data?.capabilities.firms.configured ? 'configured' : 'missing'}
                      />
                      <Readout
                        label="Overpass"
                        value={data?.capabilities.osm.enabled ? 'enabled' : 'disabled'}
                      />
                      <Readout
                        label="Classifier"
                        value={
                          data?.capabilities.ml.reachable
                            ? (data.capabilities.ml.modelVersion ?? 'reachable')
                            : 'unreachable'
                        }
                      />
                      <Readout
                        label="IMD"
                        value={data?.capabilities.imd.configured ? 'configured' : 'not configured'}
                      />
                      <Readout
                        label="Bhuvan"
                        value={data?.capabilities.bhuvan.configured ? 'configured' : 'not configured'}
                      />
                      <Readout
                        label="Demo mode"
                        value={data?.capabilities.demoMode ? 'ON' : 'off'}
                      />
                    </ReadoutList>
                  </PanelBody>
                </Panel>

                {/* --- Geofence provenance ----------------------- */}
                <Panel className="tims-enter">
                  <PanelHeader label="Geofence provenance" />
                  <PanelBody className="py-1">
                    <ReadoutList>
                      <Readout label="Area" value={boundary.data?.name ?? PILOT.label} mono={false} />
                      <Readout label="Level" value={boundary.data?.level ?? '—'} />
                      <Readout
                        label="Measured area"
                        value={
                          boundary.data
                            ? `${boundary.data.areaKm2.toLocaleString('en-IN')} km²`
                            : '—'
                        }
                      />
                      <Readout
                        label="OSM relation"
                        value={`${BHOPAL_BOUNDARY.osmType}/${BHOPAL_BOUNDARY.osmId}`}
                      />
                      <Readout label="Vertices" value={String(BHOPAL_BOUNDARY.vertices)} />
                      <Readout label="Retrieved" value={BHOPAL_BOUNDARY.retrievedAt} />
                      <Readout label="Licence" value={BHOPAL_BOUNDARY.license} />
                    </ReadoutList>
                    <Caveat className="mt-2">
                      PostGIS measures the loaded polygon at roughly the published Bhopal district
                      area, which is how the geometry is verified rather than assumed.
                    </Caveat>
                  </PanelBody>
                </Panel>
              </div>

              {/* --- Honesty notes ------------------------------- */}
              <Panel className="tims-enter">
                <PanelHeader label="What TIMS does not do" />
                <PanelBody>
                  <ul className="space-y-1.5 text-[11px] leading-relaxed text-fg-muted">
                    <li>
                      It does not predict fires. The risk score is a transparent weighted triage
                      figure, not a validated probability.
                    </li>
                    <li>
                      It does not confirm causes. A detection beside a factory is labelled{' '}
                      <span className="tims-data text-fg">possible</span> industrial, because
                      co-location is suggestive and not probative.
                    </li>
                    <li>
                      It does not estimate affected population. No licensed gridded population layer
                      is loaded, so the UI says so instead of producing a number.
                    </li>
                    <li>
                      It does not use official MPPCB or Invest MP facility coordinates, because
                      neither publishes them in a machine-readable geocoded form. An admin import
                      path exists for when verified records are obtained.
                    </li>
                    <li>
                      It does not dispatch. Acknowledging an alert records an analyst&rsquo;s name
                      for audit; it notifies no external agency.
                    </li>
                  </ul>
                </PanelBody>
              </Panel>

              <p className="tims-data px-1 pb-2 text-[10px] text-fg-subtle">
                Register last read {formatDateTime(new Date())}
              </p>
            </>
          )}
        </div>
      </div>
    </>
  );
}
