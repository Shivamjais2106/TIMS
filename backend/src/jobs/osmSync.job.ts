import cron, { type ScheduledTask } from 'node-cron';
import { env } from '../config/env';
import { syncFacilities } from '../services/integrations/osm/osm.service';
import { createLogger } from '../utils/logger';

const log = createLogger('job:osm-sync');

let running = false;

export async function osmSyncTask(): Promise<void> {
  if (running) {
    log.warn('Previous sync is still running, skipping this tick');
    return;
  }

  running = true;
  try {
    const result = await syncFacilities();
    if (result.error) log.warn(`Sync finished with an upstream error: ${result.error}`);
    else log.info(`Sync ok: ${result.created} new, ${result.updated} updated, ${result.skipped} skipped`);
  } catch (error) {
    log.error('Unexpected sync failure', { error: error instanceof Error ? error.message : error });
  } finally {
    running = false;
  }
}

export function scheduleOsmSync(): ScheduledTask {
  log.info(`Scheduled with cron "${env.OSM_CRON_SCHEDULE}"`);
  return cron.schedule(env.OSM_CRON_SCHEDULE, osmSyncTask, { timezone: 'Asia/Kolkata' });
}
