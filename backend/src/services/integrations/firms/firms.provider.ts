import { env } from '../../../config/env';
import { createLogger } from '../../../utils/logger';
import { NasaFirmsProvider } from './firms.api';
import type { FirmsProvider } from './firms.types';

const log = createLogger('firms');

let instance: FirmsProvider | null = null;

/**
 * Returns the live NASA FIRMS provider.
 *
 * There is deliberately no mock provider. An earlier version of this file fell
 * back to synthesised detections when FIRMS_MAP_KEY was absent, which meant a
 * misconfigured deployment showed a plausible-looking dashboard built entirely
 * from invented records. Every hotspot in TIMS must trace back to a real NASA
 * FIRMS API response, so a missing key is now a hard, loud failure.
 *
 * @throws when FIRMS_MAP_KEY is not configured.
 */
export function getFirmsProvider(): FirmsProvider {
  if (!env.firmsEnabled) {
    throw new Error(
      'FIRMS_MAP_KEY is not configured. TIMS will not substitute synthetic thermal data. ' +
        'Request a free key at https://firms.modaps.eosdis.nasa.gov/api/map_key/ and set FIRMS_MAP_KEY in backend/.env.',
    );
  }

  if (!instance) {
    instance = new NasaFirmsProvider();
    log.info(`Using FIRMS provider: ${instance.name} (live)`);
  }
  return instance;
}

/** True when a FIRMS fetch can be attempted at all. Checked before scheduling. */
export function isFirmsConfigured(): boolean {
  return env.firmsEnabled;
}

/** Test seam: lets a test swap in a recorded-fixture provider. */
export function setFirmsProvider(provider: FirmsProvider | null): void {
  instance = provider;
}
