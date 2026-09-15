import type { Server as HttpServer } from 'node:http';
import { Server as SocketServer, type Socket } from 'socket.io';
import { env } from '../config/env';
import { createLogger } from '../utils/logger';
import { verifyAccessToken } from '../utils/jwt';

const log = createLogger('realtime');

/**
 * Socket.io transport for live alert push.
 *
 * Kept behind this thin module so the rest of the backend can emit without
 * importing socket.io: `emitNewAlert()` is a no-op before the server is
 * attached, which means scripts and tests can run the ingest pipeline without
 * standing up a websocket server.
 */

/** Rooms clients can subscribe to. */
export const ROOMS = {
  /** Every authenticated client — receives all alerts. */
  alerts: 'alerts',
  /** Ingest/job lifecycle events, for the admin view. */
  system: 'system',
} as const;

export const EVENTS = {
  newAlert: 'new-alert',
  alertAcknowledged: 'alert-acknowledged',
  hotspotIngested: 'hotspot-ingested',
  ingestStatus: 'ingest-status',
} as const;

let io: SocketServer | null = null;

interface SocketUser {
  id: string;
  email: string;
  role: string;
}

/** Sockets carry the authenticated user so future per-role rooms are cheap. */
interface AuthedSocket extends Socket {
  user?: SocketUser;
}

export function attachRealtime(server: HttpServer): SocketServer {
  io = new SocketServer(server, {
    cors: {
      origin: env.allowedOrigins,
      credentials: true,
      methods: ['GET', 'POST'],
    },
    // The dashboard is long-lived; a generous ping window avoids dropping
    // clients whose tab has been backgrounded.
    pingTimeout: 30_000,
    pingInterval: 25_000,
    path: '/socket.io',
  });

  /**
   * Authentication is best-effort by design.
   *
   * Alert payloads contain no personal data — they are thermal detections over
   * public satellite imagery — so an unauthenticated socket is allowed to
   * listen rather than being refused. Anything sensitive stays behind the REST
   * API, which does enforce JWT. The identity is still captured when present so
   * acknowledgements can be attributed.
   */
  io.use((socket: AuthedSocket, next) => {
    const token =
      (socket.handshake.auth?.token as string | undefined) ??
      (socket.handshake.headers.authorization ?? '').replace(/^Bearer\s+/i, '');

    if (token) {
      try {
        const payload = verifyAccessToken(token);
        socket.user = { id: payload.sub, email: payload.email, role: payload.role };
      } catch {
        log.warn('Socket presented an invalid token; continuing as anonymous listener');
      }
    }
    next();
  });

  io.on('connection', (socket: AuthedSocket) => {
    void socket.join(ROOMS.alerts);
    void socket.join(ROOMS.system);

    log.info('Client connected', {
      id: socket.id,
      user: socket.user?.email ?? 'anonymous',
      clients: io?.engine.clientsCount ?? 0,
    });

    socket.on('disconnect', (reason) => {
      log.info('Client disconnected', { id: socket.id, reason });
    });
  });

  log.info('Socket.io attached', { path: '/socket.io', origins: env.allowedOrigins });
  return io;
}

export function getRealtimeServer(): SocketServer | null {
  return io;
}

/** Number of connected clients, surfaced on /api/health. */
export function getConnectionCount(): number {
  return io?.engine.clientsCount ?? 0;
}

/**
 * Pushes a newly raised alert to every listening client.
 *
 * A no-op when no server is attached, so the ingest pipeline behaves
 * identically whether it is driven by the API or by a CLI script.
 */
export function emitNewAlert(payload: unknown): void {
  if (!io) return;
  io.to(ROOMS.alerts).emit(EVENTS.newAlert, payload);
}

export function emitAlertAcknowledged(payload: unknown): void {
  if (!io) return;
  io.to(ROOMS.alerts).emit(EVENTS.alertAcknowledged, payload);
}

/** Progress/telemetry for the admin view while an ingest cycle runs. */
export function emitIngestStatus(payload: unknown): void {
  if (!io) return;
  io.to(ROOMS.system).emit(EVENTS.ingestStatus, payload);
}

export async function closeRealtime(): Promise<void> {
  if (!io) return;
  await io.close();
  io = null;
  log.info('Socket.io closed');
}
