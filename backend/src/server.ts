import type { Server } from 'node:http';
import { createApp } from './app';
import { env } from './config/env';
import { detectPostgis } from './config/postgis';
import { disconnectPrisma, prisma } from './config/prisma';
import { registerJobs, stopJobs } from './jobs';
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

  registerJobs();

  const server: Server = app.listen(env.PORT, () => {
    log.info(`TIMS API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
    log.info(`CORS origins: ${env.allowedOrigins.join(', ')}`);
  });

  const shutdown = (signal: string) => {
    log.info(`${signal} received, shutting down`);
    server.close(() => {
      void (async () => {
        await stopJobs();
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
