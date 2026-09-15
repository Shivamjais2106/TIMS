'use client';

import { useState } from 'react';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { Caveat, LiveIndicator, Status } from '@/components/ui/Indicators';
import { Panel, PanelBody, PanelHeader, Readout, ReadoutList } from '@/components/ui/Panel';
import { ErrorState, LoadingState, NoticeBanner } from '@/components/ui/States';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/hooks/useAuth';
import { useRealtime } from '@/hooks/useRealtime';
import { usePalette } from '@/hooks/useTheme';
import { ThemeSelector } from '@/components/layout/ThemeToggle';
import { useStaggerIn } from '@/hooks/useGsap';
import { useNavOpener } from '../DashboardShell';
import { describeError } from '@/lib/api';
import {
  BHOPAL_BBOX,
  BHOPAL_BBOX_PARAM,
  MAP_DEFAULTS,
  PILOT,
  RISK_BANDS,
  RISK_WEIGHTS,
  THRESHOLDS,
} from '@/lib/bhopal';
import { formatDateTime } from '@/lib/format';
import { adminService, bhopalService } from '@/services';

/**
 * Profile, pilot configuration and administrative actions.
 *
 * The configuration values shown here are the generated ones from
 * shared/bhopal.config.json, so this page doubles as a check that the frontend
 * and backend are reading the same scoping numbers.
 */
export function SettingsClient() {
  const openNav = useNavOpener();
  const containerRef = useStaggerIn();
  const { user, hasRole, logout } = useAuth();
  const { connected } = useRealtime();
  const palette = usePalette();

  const health = useApi(() => bhopalService.health(), []);

  const [action, setAction] = useState<{ busy: string | null; message: string | null; error: string | null }>(
    { busy: null, message: null, error: null },
  );

  const isAdmin = hasRole('ADMIN');

  async function run(name: string, task: () => Promise<Record<string, unknown>>) {
    setAction({ busy: name, message: null, error: null });
    try {
      const result = await task();
      setAction({
        busy: null,
        // The raw result is shown rather than a generic "done": these actions
        // call NASA and Overpass, and the real counts are the useful feedback.
        message: JSON.stringify(result, null, 2),
        error: null,
      });
      health.refetch();
    } catch (error) {
      setAction({ busy: null, message: null, error: describeError(error) });
    }
  }

  return (
    <>
      <Header
        title="Settings"
        subtitle={`${PILOT.label} pilot configuration`}
        onOpenNav={openNav}
        actions={<LiveIndicator connected={connected} />}
      />

      <div ref={containerRef} className="flex-1 overflow-y-auto p-3">
        <div className="grid gap-3 lg:grid-cols-2">
          {/* --- Profile -------------------------------------------- */}
          <Panel className="tims-enter">
            <PanelHeader label="Profile" title={user?.name ?? 'Signed out'} />
            <PanelBody className="space-y-2">
              <ReadoutList>
                <Readout label="Name" value={user?.name ?? '—'} mono={false} />
                <Readout label="Email" value={user?.email ?? '—'} />
                <Readout label="Role" value={user?.role ?? '—'} />
                <Readout label="Account created" value={formatDateTime(user?.createdAt)} mono={false} />
              </ReadoutList>

              <div className="border border-line bg-surface-2 p-2">
                <p className="tims-label mb-1">Role permissions</p>
                <ul className="space-y-0.5 text-[10px] leading-snug text-fg-muted">
                  <li>
                    <span className="tims-data text-fg">VIEWER</span> — read every register and report.
                  </li>
                  <li>
                    <span className="tims-data text-fg">ANALYST</span> — plus acknowledge and resolve
                    alerts, generate reports.
                  </li>
                  <li>
                    <span className="tims-data text-fg">ADMIN</span> — plus trigger manual data
                    synchronisation and delete records.
                  </li>
                </ul>
              </div>

              <Button variant="danger" onClick={() => void logout()} className="w-full">
                Sign out
              </Button>
            </PanelBody>
          </Panel>

          {/* --- Appearance ----------------------------------------- */}
          <Panel className="tims-enter">
            <PanelHeader label="Appearance" />
            <PanelBody className="space-y-2">
              <div>
                <p className="tims-label mb-1.5">Theme</p>
                <ThemeSelector />
              </div>

              <ReadoutList>
                <Readout label="Heading / body type" value="IBM Plex Sans" mono={false} />
                <Readout label="Data type" value="IBM Plex Mono" mono={false} />
                <Readout label="Timezone" value={`${PILOT.timezone} (IST)`} />
                <Readout label="Number locale" value="en-IN" />
              </ReadoutList>

              <Caveat>
                Light mode is a second treatment, not an inversion: the substrate becomes warm
                paper-white like a printed survey sheet, and both accents darken so they still clear
                4.5:1 contrast. The risk ramp keeps its order and meaning in both themes.
              </Caveat>

              <div className="border border-line bg-surface-2 p-2">
                <p className="tims-label mb-1.5">Palette</p>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { name: 'substrate', value: palette.bg },
                    { name: 'surface', value: palette.surface },
                    { name: 'hairline', value: palette.line },
                    { name: 'text', value: palette.fg },
                    { name: 'muted', value: palette.fgMuted },
                    { name: 'rust', value: palette.rust },
                    { name: 'sage', value: palette.sage },
                  ].map((swatch) => (
                    <span key={swatch.name} className="flex items-center gap-1" title={swatch.value}>
                      <span
                        className="size-3 flex-none border border-line-strong"
                        style={{ background: swatch.value }}
                        aria-hidden
                      />
                      <span className="tims-data text-[9px] text-fg-subtle">{swatch.name}</span>
                    </span>
                  ))}
                </div>
              </div>
            </PanelBody>
          </Panel>

          {/* --- Pilot scoping ------------------------------------- */}
          <Panel className="tims-enter">
            <PanelHeader label="Pilot scoping" title={`${PILOT.label} (${PILOT.id})`} />
            <PanelBody className="space-y-2">
              <ReadoutList>
                <Readout label="Fetch bbox" value={BHOPAL_BBOX_PARAM} />
                <Readout
                  label="Bbox extent"
                  value={`${(BHOPAL_BBOX.maxLng - BHOPAL_BBOX.minLng).toFixed(2)}° × ${(
                    BHOPAL_BBOX.maxLat - BHOPAL_BBOX.minLat
                  ).toFixed(2)}°`}
                />
                <Readout label="Map centre" value={MAP_DEFAULTS.center.join(', ')} />
                <Readout label="Default zoom" value={String(MAP_DEFAULTS.zoom)} />
                <Readout
                  label="Industrial proximity"
                  value={`${THRESHOLDS.industrialProximityM} m`}
                />
                <Readout
                  label="Industrial influence"
                  value={`${THRESHOLDS.industrialInfluenceM} m`}
                />
                <Readout
                  label="Persistent threshold"
                  value={`${THRESHOLDS.persistentSourceDetections} days`}
                />
                <Readout
                  label="Recurrence radius"
                  value={`${THRESHOLDS.persistenceRadiusM} m`}
                />
                <Readout
                  label="Impact zones"
                  value={`${THRESHOLDS.impactZonesKm.join(' / ')} km`}
                />
                <Readout
                  label="High-confidence ML"
                  value={`${(THRESHOLDS.highConfidenceMlThreshold * 100).toFixed(0)}%`}
                />
              </ReadoutList>

              <Caveat>
                These values are generated from <span className="tims-data">shared/bhopal.config.json</span>{' '}
                into both apps, so the frontend and the backend cannot disagree about the pilot
                geography. Widening beyond Bhopal is a change to that one file.
              </Caveat>
            </PanelBody>
          </Panel>

          {/* --- Risk weights -------------------------------------- */}
          <Panel className="tims-enter">
            <PanelHeader label="Risk model" title="Weights and bands" />
            <PanelBody className="space-y-2">
              <ReadoutList>
                <Readout label="Fire radiative power" value={`${RISK_WEIGHTS.frp}%`} />
                <Readout label="Detection confidence" value={`${RISK_WEIGHTS.confidence}%`} />
                <Readout label="Persistence" value={`${RISK_WEIGHTS.persistence}%`} />
                <Readout
                  label="Industrial proximity"
                  value={`${RISK_WEIGHTS.industrialProximity}%`}
                />
                <Readout
                  label="Populated proximity"
                  value={`${RISK_WEIGHTS.populatedProximity}%`}
                />
                <Readout
                  label="Total"
                  value={`${
                    RISK_WEIGHTS.frp +
                    RISK_WEIGHTS.confidence +
                    RISK_WEIGHTS.persistence +
                    RISK_WEIGHTS.industrialProximity +
                    RISK_WEIGHTS.populatedProximity
                  }%`}
                />
              </ReadoutList>

              <div className="border border-line bg-surface-2 p-2">
                <p className="tims-label mb-1">Bands</p>
                <p className="tims-data text-[10px] text-fg-muted">
                  LOW {RISK_BANDS.LOW}–{RISK_BANDS.MEDIUM - 1} · MEDIUM {RISK_BANDS.MEDIUM}–
                  {RISK_BANDS.HIGH - 1} · HIGH {RISK_BANDS.HIGH}–{RISK_BANDS.CRITICAL - 1} · CRITICAL{' '}
                  {RISK_BANDS.CRITICAL}+
                </p>
              </div>

              <Caveat>
                Weights are configurable and every score is stored with the weight set that produced
                it, so changing them cannot rewrite a score an analyst already acted on.
              </Caveat>
            </PanelBody>
          </Panel>

          {/* --- System ------------------------------------------- */}
          <Panel className="tims-enter lg:col-span-2">
            <PanelHeader
              label="System"
              meta={health.data ? `uptime ${Math.round(health.data.uptimeSeconds / 60)} min` : undefined}
            />
            <PanelBody>
              {health.loading && !health.data ? (
                <LoadingState />
              ) : health.error ? (
                <ErrorState message={health.error} onRetry={health.refetch} />
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  <ReadoutList>
                    <Readout label="API status" value={health.data?.status ?? '—'} />
                    <Readout label="Environment" value={health.data?.environment ?? '—'} />
                    <Readout
                      label="Database"
                      value={health.data?.dependencies.database ? 'connected' : 'unreachable'}
                    />
                    <Readout
                      label="PostGIS"
                      value={
                        health.data?.dependencies.postgis.available
                          ? (health.data.dependencies.postgis.version ?? 'available')
                          : 'unavailable'
                      }
                    />
                    <Readout
                      label="Realtime clients"
                      value={String(health.data?.dependencies.realtimeClients ?? 0)}
                    />
                  </ReadoutList>

                  <ReadoutList>
                    <Readout
                      label="FIRMS key"
                      value={health.data?.dependencies.firms.configured ? 'configured' : 'missing'}
                    />
                    <Readout
                      label="Classifier"
                      value={
                        health.data?.dependencies.mlService.reachable
                          ? (health.data.dependencies.mlService.modelVersion ?? 'reachable')
                          : 'rule fallback'
                      }
                    />
                    <Readout
                      label="Scheduled jobs"
                      value={health.data?.dependencies.cronJobs ? 'enabled' : 'disabled'}
                    />
                    <Readout
                      label="IMD"
                      value={
                        health.data?.dependencies.weather.imdConfigured
                          ? 'configured'
                          : 'not configured'
                      }
                    />
                    <Readout
                      label="Demo mode"
                      value={health.data?.dependencies.demoMode ? 'ON' : 'off'}
                    />
                  </ReadoutList>
                </div>
              )}
            </PanelBody>
          </Panel>

          {/* --- Admin actions ------------------------------------ */}
          <Panel className="tims-enter lg:col-span-2">
            <PanelHeader label="Data synchronisation" title="Manual triggers" />
            <PanelBody className="space-y-2.5">
              {!isAdmin ? (
                <NoticeBanner label="Restricted" tone="info">
                  Manual synchronisation is ADMIN-only. These actions call rate-limited third-party
                  APIs and write to the database, so an analyst or viewer cannot fire them.
                </NoticeBanner>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="primary"
                      disabled={action.busy !== null}
                      onClick={() => void run('firms', () => adminService.syncFirms())}
                    >
                      {action.busy === 'firms' ? 'Fetching NASA FIRMS…' : 'Sync FIRMS (NRT)'}
                    </Button>
                    <Button
                      disabled={action.busy !== null}
                      onClick={() =>
                        void run('archive', () => adminService.syncFirms({ forceArchive: true }))
                      }
                    >
                      {action.busy === 'archive' ? 'Sweeping archive…' : 'Sweep FIRMS archive'}
                    </Button>
                    <Button
                      disabled={action.busy !== null}
                      onClick={() => void run('osm', () => adminService.syncOsm())}
                    >
                      {action.busy === 'osm' ? 'Querying Overpass…' : 'Sync OpenStreetMap'}
                    </Button>
                    <Button
                      disabled={action.busy !== null}
                      onClick={() => void run('recompute', () => adminService.recompute(true))}
                    >
                      {action.busy === 'recompute' ? 'Recomputing…' : 'Recompute persistence'}
                    </Button>
                  </div>

                  <Caveat>
                    An archive sweep queries several NASA products across multiple fire seasons and
                    can take a few minutes. Overpass rate-limits aggressively, so the OSM sync is
                    normally left to its weekly schedule.
                  </Caveat>
                </>
              )}

              {action.error ? <ErrorState message={action.error} /> : null}

              {action.message ? (
                <div>
                  <p className="tims-label mb-1">Result</p>
                  <pre className="tims-data max-h-[260px] overflow-auto border border-line bg-surface-2 p-2 text-[10px] leading-relaxed text-fg-muted">
                    {action.message}
                  </pre>
                </div>
              ) : null}
            </PanelBody>
          </Panel>
        </div>
      </div>
    </>
  );
}
