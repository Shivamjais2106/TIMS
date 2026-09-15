import cron, { type ScheduledTask } from 'node-cron';
import { MAP_DEFAULTS } from '../config/bhopal';
import { env } from '../config/env';
import { getCurrentWeather } from '../services/weather.service';
import { createLogger } from '../utils/logger';

const log = createLogger('job:weather');

let running = false;

/**
 * Samples weather context for the pilot centre.
 *
 * Deliberately one sample per tick rather than one per hotspot: weather over a
 * 25 km box does not vary enough to justify hundreds of provider calls, and
 * hammering a free API would be abusive.
 */
export async function weatherTask(): Promise<void> {
  if (running) {
    log.warn('Previous weather fetch is still running, skipping this tick');
    return;
  }

  running = true;
  try {
    const [latitude, longitude] = MAP_DEFAULTS.center;
    const result = await getCurrentWeather(latitude, longitude);

    if (result.available && result.reading) {
      log.info(
        `Weather ok via ${result.reading.provider}: ` +
          `${result.reading.temperatureC ?? '?'}C, ` +
          `${result.reading.humidityPct ?? '?'}% RH, ` +
          `wind ${result.reading.windSpeedMs ?? '?'} m/s`,
      );
    } else {
      log.warn(`Weather unavailable: ${result.note}`);
    }
  } catch (error) {
    log.error('Weather fetch failed', { error: error instanceof Error ? error.message : error });
  } finally {
    running = false;
  }
}

export function scheduleWeather(): ScheduledTask {
  log.info(`Scheduled with cron "${env.WEATHER_CRON_SCHEDULE}" (Asia/Kolkata)`);
  return cron.schedule(env.WEATHER_CRON_SCHEDULE, weatherTask, { timezone: 'Asia/Kolkata' });
}
