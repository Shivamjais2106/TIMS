import cron, { type ScheduledTask } from 'node-cron';
import { env } from '../config/env';
import { runFirmsIngest } from '../services/integrations/firms/firms.service';
import { createLogger } from '../utils/logger';

const log = createLogger('job:firms-ingest');

/** Guards against overlapping runs when an ingest outlives its interval. */
let running = false;

export async function firmsIngestTask(): Promise<void> {
  if (running) {
    log.warn('Previous ingest is still running, skipping this tick');
    return;
  }

  running = true;
  try {
    const result = await runFirmsIngest();
    if (result.error) {
      log.warn(`Ingest finished with an upstream error: ${result.error}`);
    } else {
      log.info(`Ingest ok: ${result.created} new, ${result.duplicates} duplicates, ${result.alertsRaised} alerts`);
    }
  } catch (error) {
    // runFirmsIngest already swallows provider errors; this is belt and braces
    // so a cron tick can never crash the process.
    log.error('Unexpected ingest failure', { error: error instanceof Error ? error.message : error });
  } finally {
    running = false;
  }
}

export function scheduleFirmsIngest(): ScheduledTask {
  log.info(`Scheduled with cron "${env.FIRMS_CRON_SCHEDULE}"`);
  return cron.schedule(env.FIRMS_CRON_SCHEDULE, firmsIngestTask, { timezone: 'Asia/Kolkata' });
}
