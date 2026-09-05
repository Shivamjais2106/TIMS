import type { ScheduledTask } from 'node-cron';
import { env } from '../config/env';
import { createLogger } from '../utils/logger';
import { scheduleFirmsIngest } from './firmsIngest.job';
import { scheduleOsmSync } from './osmSync.job';
import { schedulePersistenceRecompute } from './persistence.job';

const log = createLogger('jobs');

let tasks: ScheduledTask[] = [];

/**
 * Registers every scheduled job.
 *
 * Disabled by default (ENABLE_CRON_JOBS=false) so a development server does not
 * mutate the database behind the developer's back or hammer external APIs.
 */
export function registerJobs(): void {
  if (!env.ENABLE_CRON_JOBS) {
    log.info('Scheduled jobs are disabled (set ENABLE_CRON_JOBS=true to enable)');
    return;
  }

  tasks = [scheduleFirmsIngest(), schedulePersistenceRecompute()];
  if (env.OSM_ENABLED) tasks.push(scheduleOsmSync());

  log.info(`${tasks.length} scheduled job(s) registered`);
}

/** Stops all jobs — used during graceful shutdown. */
export async function stopJobs(): Promise<void> {
  await Promise.all(tasks.map((task) => task.stop()));
  tasks = [];
}

export { firmsIngestTask } from './firmsIngest.job';
export { osmSyncTask } from './osmSync.job';
export { persistenceTask } from './persistence.job';
