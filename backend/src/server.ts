import { createServer, type Server } from 'node:http';
import { createApp } from './app';
import { env } from './config/env';
import { detectPostgis } from './config/postgis';
import { disconnectPrisma, prisma } from './config/prisma';
import { registerJobs, stopJobs } from './jobs';
import { attachRealtime, closeRealtime } from './realtime';
import { checkMlService, getMlServiceHealth } from './services/classification.service';
import { isFirmsConfigured } from './services/integrations/firms/firms.provider';
import { PILOT } from './config/bhopal';
import { createLogger } from './utils/logger';

const log = createLogger('server');

async function bootstrap(): Promise<void> {
  const app = createApp();

  // Fail loudly here rather than on the first request.
  try {
    await prisma.$queryRaw`SELECT 1`;
    log.info('Database connection established');
  } catch (error) {
    log.error('Could not reach the database. Check DATABASE_URL and that PostgreSQL is running.', {
      error: error instanceof Error ? error.message : error,
    });
    process.exit(1);
  }

  // Geospatial endpoints consult this; a missing extension is a warning, not a
  // fatal error, so the rest of the API still works.
  await detectPostgis();

  // Capability checks at boot, so a misconfiguration is visible in the startup
  // log rather than discovered on the first ingest tick.
  if (!isFirmsConfigured()) {
    log.warn(
      'FIRMS_MAP_KEY is not set. Thermal ingestion is disabled — TIMS will not ' +
        'substitute synthetic data. Get a free key at ' +
        'https://firms.modaps.eosdis.nasa.gov/api/map_key/',
    );
  }

  await checkMlService(true);
  const ml = getMlServiceHealth();
  log.info(
    ml.reachable
      ? `Classification service reachable (model ${ml.modelVersion ?? 'unknown'})`
      : `Classification service unreachable (${ml.reason ?? 'unknown'}) — ingest will use the rule-based fallback`,
  );

  // An explicit http.Server is required so Socket.io can share the port with
  // Express, rather than app.listen() creating one we cannot reach.
  const server: Server = createServer(app);

  attachRealtime(server);

  registerJobs();

  server.listen(env.PORT, () => {
    log.info(`TIMS API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
    log.info(`Pilot: ${PILOT.label} (${PILOT.id})`);
    log.info(`Socket.io: ws://localhost:${env.PORT}/socket.io`);
    log.info(`CORS origins: ${env.allowedOrigins.join(', ')}`);
  });

  const shutdown = (signal: string) => {
    log.info(`${signal} received, shutting down`);
    server.close(() => {
      void (async () => {
        await stopJobs();
        await closeRealtime();
        await disconnectPrisma();
        log.info('Shutdown complete');
        process.exit(0);
      })();
    });

    // Do not hang forever on a stuck connection.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  process.on('unhandledRejection', (reason) => {
    log.error('Unhandled promise rejection', { reason });
  });
  process.on('uncaughtException', (error) => {
    log.error('Uncaught exception', { error: error.message, stack: error.stack });
    process.exit(1);
  });
}

void bootstrap();
