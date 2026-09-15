'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { API_BASE_URL } from '@/lib/api';
import { getToken } from '@/lib/auth';
import type { Alert } from '@/types';

/**
 * Socket.io connection shared by the whole dashboard.
 *
 * One socket per browser tab, held at the layout level, so the notification
 * bell, the alerts page and any map overlay all observe the same stream rather
 * than each opening their own connection.
 */

interface RealtimeState {
  connected: boolean;
  /** Alerts pushed during this session, newest first. */
  liveAlerts: Alert[];
  /** Count of pushes not yet seen by the user. */
  unseenCount: number;
  /** Most recent push, for a transient toast. */
  latest: Alert | null;
  markSeen: () => void;
  dismissLatest: () => void;
}

const RealtimeContext = createContext<RealtimeState | null>(null);

/** The websocket origin, derived from the REST base URL. */
function socketOrigin(): string {
  // API_BASE_URL is ".../api"; Socket.io is mounted at the server root.
  return API_BASE_URL.replace(/\/api\/?$/, '');
}

/** How many pushed alerts to retain in memory. */
const MAX_LIVE_ALERTS = 50;

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const [connected, setConnected] = useState(false);
  const [liveAlerts, setLiveAlerts] = useState<Alert[]>([]);
  const [unseenCount, setUnseenCount] = useState(0);
  const [latest, setLatest] = useState<Alert | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    // Guarded so the effect is inert during SSR and in the brief window before
    // the auth token is readable.
    if (typeof window === 'undefined') return;

    const socket = io(socketOrigin(), {
      // Token is optional: alert payloads carry no personal data, and the
      // server accepts anonymous listeners. Sending it when present lets the
      // server attribute anything the client does later.
      auth: { token: getToken() ?? undefined },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 10_000,
    });

    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', () => setConnected(false));

    socket.on('new-alert', (alert: Alert) => {
      setLiveAlerts((previous) => {
        // De-duplicate: a reconnect can redeliver, and the same alert appearing
        // twice in the feed would look like two separate incidents.
        if (previous.some((existing) => existing.id === alert.id)) return previous;
        return [alert, ...previous].slice(0, MAX_LIVE_ALERTS);
      });
      setUnseenCount((count) => count + 1);
      setLatest(alert);
    });

    socket.on('alert-acknowledged', (alert: Alert) => {
      // Replace in place rather than prepending: an acknowledgement is a state
      // change to an existing alert, not a new event.
      setLiveAlerts((previous) =>
        previous.map((existing) => (existing.id === alert.id ? alert : existing)),
      );
    });

    return () => {
      socket.removeAllListeners();
      // React 19 strict mode mounts effects twice in development, so this
      // cleanup fires while the first handshake is still in flight and the
      // browser logs "WebSocket is closed before the connection is
      // established". Tearing down the engine's transport first makes that
      // teardown orderly instead of aborting mid-handshake.
      if (socket.connected) {
        socket.disconnect();
      } else {
        socket.io.engine?.close();
      }
      socket.close();
      socketRef.current = null;
    };
  }, []);

  const markSeen = useCallback(() => setUnseenCount(0), []);
  const dismissLatest = useCallback(() => setLatest(null), []);

  const value = useMemo<RealtimeState>(
    () => ({ connected, liveAlerts, unseenCount, latest, markSeen, dismissLatest }),
    [connected, liveAlerts, unseenCount, latest, markSeen, dismissLatest],
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime(): RealtimeState {
  const context = useContext(RealtimeContext);
  if (!context) {
    throw new Error('useRealtime must be used inside a RealtimeProvider');
  }
  return context;
}
