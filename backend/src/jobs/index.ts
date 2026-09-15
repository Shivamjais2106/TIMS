import type { ScheduledTask } from 'node-cron';
import { env } from '../config/env';
import { createLogger } from '../utils/logger';
import { scheduleFirmsIngest } from './firmsIngest.job';
import { scheduleOsmSync } from './osmSync.job';
import { schedulePersistenceRecompute } from './persistence.job';
import { scheduleWeather } from './weather.job';

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

  // FIRMS ingest every 30 minutes is the pilot's heartbeat (Part 4, step 11).
  // Persistence recompute and weather sampling are offset from it so three
  // jobs never contend for the same database connection burst.
  tasks = [scheduleFirmsIngest(), schedulePersistenceRecompute(), scheduleWeather()];

  // Overpass is rate-limited and facility footprints change on a timescale of
  // months, so this runs weekly rather than on the ingest cadence.
  if (env.OSM_ENABLED) tasks.push(scheduleOsmSync());

  log.info(`${tasks.length} scheduled job(s) registered`, {
    firms: env.FIRMS_CRON_SCHEDULE,
    persistence: env.ANALYTICS_CRON_SCHEDULE,
    weather: env.WEATHER_CRON_SCHEDULE,
    osm: env.OSM_ENABLED ? env.OSM_CRON_SCHEDULE : 'disabled',
  });
}

/** Stops all jobs — used during graceful shutdown. */
export async function stopJobs(): Promise<void> {
  await Promise.all(tasks.map((task) => task.stop()));
  tasks = [];
}

export { firmsIngestTask } from './firmsIngest.job';
export { osmSyncTask } from './osmSync.job';
export { persistenceTask } from './persistence.job';
export { weatherTask } from './weather.job';
