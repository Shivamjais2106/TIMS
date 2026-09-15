import cron, { type ScheduledTask } from 'node-cron';
import { env } from '../config/env';
import { isFirmsConfigured } from '../services/integrations/firms/firms.provider';
import { runIngestCycle } from '../services/ingest.service';
import { createLogger } from '../utils/logger';

const log = createLogger('job:firms-ingest');

/** Guards against overlapping runs when an ingest outlives its interval. */
let running = false;

/**
 * One scheduled ingest cycle for the Bhopal pilot area.
 *
 * Wires Part 4 steps 1 (FIRMS fetch), 3 (geospatial features) and 10
 * (classification) into a single cron-driven pass.
 */
export async function firmsIngestTask(): Promise<void> {
  if (running) {
    log.warn('Previous ingest is still running, skipping this tick');
    return;
  }

  if (!isFirmsConfigured()) {
    log.error('FIRMS_MAP_KEY is not configured — skipping ingest rather than fabricating data');
    return;
  }

  running = true;
  try {
    const result = await runIngestCycle();

    if (result.errors.length > 0) {
      log.warn(`Ingest finished with ${result.errors.length} upstream error(s)`, {
        errors: result.errors.slice(0, 5),
      });
    }

    log.info(
      `Ingest ok [${result.window.kind}]: ${result.created} new, ${result.duplicates} duplicate, ` +
        `${result.outsideBoundary} outside boundary, ${result.alertsRaised} alert(s) ` +
        `(model ${result.classifiedByModel} / rules ${result.classifiedByRules})`,
    );
  } catch (error) {
    // runIngestCycle already swallows provider errors; this is belt and braces
    // so a cron tick can never crash the process.
    log.error('Unexpected ingest failure', { error: error instanceof Error ? error.message : error });
  } finally {
    running = false;
  }
}

export function scheduleFirmsIngest(): ScheduledTask {
  log.info(`Scheduled with cron "${env.FIRMS_CRON_SCHEDULE}" (Asia/Kolkata)`);
  return cron.schedule(env.FIRMS_CRON_SCHEDULE, firmsIngestTask, { timezone: 'Asia/Kolkata' });
}
