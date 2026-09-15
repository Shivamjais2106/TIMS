import cron, { type ScheduledTask } from 'node-cron';
import { env } from '../config/env';
import { syncAllOsm } from '../services/integrations/osm/osm.service';
import { createLogger } from '../utils/logger';

const log = createLogger('job:osm-sync');

let running = false;

/**
 * Refreshes industrial and emergency facility geometry from OpenStreetMap.
 *
 * Runs weekly rather than every 30 minutes: facility footprints change on a
 * timescale of months, and Overpass rate-limits aggressively.
 */
export async function osmSyncTask(): Promise<void> {
  if (running) {
    log.warn('Previous sync is still running, skipping this tick');
    return;
  }

  running = true;
  try {
    const { industrial, emergency } = await syncAllOsm();

    for (const [label, result] of [['industrial', industrial], ['emergency', emergency]] as const) {
      if (result.error) log.warn(`${label} sync finished with an upstream error: ${result.error}`);
      else {
        log.info(
          `${label} sync ok: ${result.created} new, ${result.updated} updated, ` +
            `${result.skipped} skipped, ${result.unnamed} unnamed`,
        );
      }
    }
  } catch (error) {
    log.error('Unexpected sync failure', { error: error instanceof Error ? error.message : error });
  } finally {
    running = false;
  }
}

export function scheduleOsmSync(): ScheduledTask {
  log.info(`Scheduled with cron "${env.OSM_CRON_SCHEDULE}" (Asia/Kolkata)`);
  return cron.schedule(env.OSM_CRON_SCHEDULE, osmSyncTask, { timezone: 'Asia/Kolkata' });
}
