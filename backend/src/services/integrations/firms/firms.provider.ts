import { env } from '../../../config/env';
import { createLogger } from '../../../utils/logger';
import { NasaFirmsProvider } from './firms.api';
import { MockFirmsProvider } from './firms.mock';
import type { FirmsProvider } from './firms.types';

const log = createLogger('firms');

let instance: FirmsProvider | null = null;

/**
 * Returns the active FIRMS provider.
 *
 * The live NASA provider is selected only when FIRMS_MAP_KEY is present.
 * Without a key the mock provider is used, so the application boots, seeds and
 * demos correctly with zero external credentials — which is the whole point of
 * keeping the provider behind this interface.
 */
export function getFirmsProvider(): FirmsProvider {
  if (!instance) {
    instance = env.firmsEnabled ? new NasaFirmsProvider() : new MockFirmsProvider();
    log.info(`Using FIRMS provider: ${instance.name}${instance.isLive ? '' : ' (no MAP_KEY configured)'}`);
  }
  return instance;
}

/** Test seam: lets a test or script swap the provider. */
export function setFirmsProvider(provider: FirmsProvider | null): void {
  instance = provider;
}
