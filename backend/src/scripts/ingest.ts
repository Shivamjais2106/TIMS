import { detectPostgis } from '../config/postgis';
import { disconnectPrisma } from '../config/prisma';
import { runFirmsIngest } from '../services/integrations/firms/firms.service';
import { createLogger } from '../utils/logger';

const log = createLogger('script:ingest');

/**
 * Runs one FIRMS ingest cycle from the command line.
 *
 * Useful for demoing the pipeline without waiting for the cron schedule:
 *   npm run firms:ingest
 */
async function main(): Promise<void> {
  await detectPostgis();
  const result = await runFirmsIngest();
  log.info('Result', result);
}

main()
  .catch((error: unknown) => {
    log.error('Ingest script failed', { error: error instanceof Error ? error.stack : error });
    process.exitCode = 1;
  })
  .finally(() => disconnectPrisma());
