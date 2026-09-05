import cron, { type ScheduledTask } from 'node-cron';
import { env } from '../config/env';
import { recomputePersistence } from '../services/integrations/firms/firms.service';
import { createLogger } from '../utils/logger';

const log = createLogger('job:persistence');

let running = false;

/**
 * Re-evaluates how long each thermal source has been active.
 *
 * Runs separately from ingest because persistence is only knowable in
 * hindsight: a detection recorded today becomes "persistent" only once
 * tomorrow's pass confirms it.
 */
export async function persistenceTask(): Promise<void> {
  if (running) {
    log.warn('Previous recompute is still running, skipping this tick');
    return;
  }

  running = true;
  try {
    const { examined, updated } = await recomputePersistence();
    log.info(`Recompute ok: ${updated}/${examined} hotspots re-scored`);
  } catch (error) {
    log.error('Persistence recompute failed', { error: error instanceof Error ? error.message : error });
  } finally {
    running = false;
  }
}

export function schedulePersistenceRecompute(): ScheduledTask {
  log.info(`Scheduled with cron "${env.ANALYTICS_CRON_SCHEDULE}"`);
  return cron.schedule(env.ANALYTICS_CRON_SCHEDULE, persistenceTask, { timezone: 'Asia/Kolkata' });
}
