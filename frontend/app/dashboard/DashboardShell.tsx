'use client';

import { useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { Panel, PanelBody, PanelHeader, Readout, ReadoutList } from '@/components/ui/Panel';
import { DemoBanner, LoadingState } from '@/components/ui/States';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/hooks/useAuth';
import { useRealtime } from '@/hooks/useRealtime';
import { WordmarkFull } from '@/components/layout/Logo';
import { API_BASE_URL } from '@/lib/api';
import { alertService, bhopalService } from '@/services';

/**
 * Lets a page's Header open the mobile drawer that the shell owns, without
 * threading a callback through every page component.
 */
const NavOpenerContext = createContext<(() => void) | null>(null);

export function useNavOpener(): (() => void) | undefined {
  return useContext(NavOpenerContext) ?? undefined;
}

/**
 * Authenticated dashboard shell: route guard, navigation rail, demo banner.
 *
 * The unread-alert count is fetched once here and then kept current by the
 * Socket.io stream, so the badge updates without polling.
 */
export function DashboardShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, loading, apiUnreachable, retry } = useAuth();
  const { liveAlerts } = useRealtime();
  const [navOpen, setNavOpen] = useState(false);

  const unread = useApi(() => alertService.unreadCount(), []);
  const health = useApi(() => bhopalService.health(), []);

  useEffect(() => {
    // Only redirect for a genuine "not signed in". When the API is simply
    // unreachable we must not bounce to /login, because that page cannot sign
    // anyone in either — it produces a redirect loop that looks like a blank
    // screen, which is exactly what a dead backend used to cause here.
    if (!loading && !user && !apiUnreachable) router.replace('/login');
  }, [loading, user, apiUnreachable, router]);

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-bg">
        <LoadingState label="Restoring session" />
      </div>
    );
  }

  // --- API unreachable ----------------------------------------------------
  // Shown instead of a blank page. A dead backend is the single most common
  // local failure, so it gets an explicit diagnosis and the command to fix it.
  if (apiUnreachable) {
    return (
      <div className="tims-grid grid min-h-screen place-items-center bg-bg p-4">
        <div className="w-full max-w-lg">
          <WordmarkFull className="mb-3" />

          <Panel className="border-l-2 border-l-rust">
            <PanelHeader label="Backend unreachable" title="Cannot reach the TIMS API" />
            <PanelBody className="space-y-3">
              <p className="text-[12px] leading-relaxed text-fg-muted">
                The console loaded, but the API is not answering. Nothing on this page would be
                real data, so it is not shown.
              </p>

              <ReadoutList>
                <Readout label="Expected at" value={API_BASE_URL} />
                <Readout label="Status" value="connection refused" />
              </ReadoutList>

              <div className="border border-line bg-surface-2 p-2.5">
                <p className="tims-label mb-1.5">Start the backend</p>
                <pre className="tims-data overflow-x-auto text-[11px] leading-relaxed text-fg">
                  {'cd backend\nnpm run dev'}
                </pre>
              </div>

              <div className="border border-line bg-surface-2 p-2.5">
                <p className="tims-label mb-1.5">If it reports EADDRINUSE</p>
                <p className="text-[11px] leading-relaxed text-fg-muted">
                  Something already holds port 4000. Find and stop it:
                </p>
                <pre className="tims-data mt-1.5 overflow-x-auto text-[10px] leading-relaxed text-fg-muted">
                  {'powershell "Get-NetTCPConnection -LocalPort 4000 -State Listen | Select OwningProcess"'}
                </pre>
              </div>

              <button
                type="button"
                onClick={retry}
                className="tims-nav-item w-full border border-rust bg-rust/12 px-3 py-2 text-[12px] text-rust hover:bg-rust/20"
              >
                Retry connection
              </button>
            </PanelBody>
          </Panel>
        </div>
      </div>
    );
  }

  // The redirect above is already in flight; rendering nothing avoids a flash
  // of the console for a signed-out user.
  if (!user) return null;

  // Server-side count plus anything pushed since the page loaded.
  const unreadCount = (unread.data?.total ?? 0) + liveAlerts.filter((alert) => !alert.isRead).length;
  const demoMode = health.data?.dependencies.demoMode ?? false;

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      {demoMode ? <DemoBanner /> : null}

      <div className="flex flex-1 overflow-hidden">
        {/* Desktop rail */}
        <aside className="hidden w-[184px] flex-none lg:block">
          <div className="sticky top-0 h-screen">
            <Sidebar unreadAlerts={unreadCount} />
          </div>
        </aside>

        {/* Mobile drawer */}
        {navOpen ? (
          <div className="fixed inset-0 z-50 flex lg:hidden">
            <div className="absolute inset-0 bg-bg/80" onClick={() => setNavOpen(false)} aria-hidden />
            <div className="relative w-[204px]">
              <Sidebar unreadAlerts={unreadCount} onNavigate={() => setNavOpen(false)} />
            </div>
          </div>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Each page renders its own Header so it can set the title and
              page-specific actions; the shell only provides the nav opener. */}
          <NavOpenerContext.Provider value={() => setNavOpen(true)}>
            <main className="flex min-w-0 flex-1 flex-col">{children}</main>
          </NavOpenerContext.Provider>
        </div>
      </div>
    </div>
  );
}
