import { createLogger } from '../../../utils/logger';
import { OverpassOsmProvider } from './osm.overpass';
import type { OsmProvider } from './osm.types';

const log = createLogger('osm');

let instance: OsmProvider | null = null;

/**
 * Returns the live Overpass provider.
 *
 * As with FIRMS there is no mock: facility locations must come from real
 * OpenStreetMap geometry, because a fabricated factory coordinate would
 * corrupt every distance-to-facility feature the classifier depends on.
 */
export function getOsmProvider(): OsmProvider {
  if (!instance) {
    instance = new OverpassOsmProvider();
    log.info(`Using OSM provider: ${instance.name} (live)`);
  }
  return instance;
}

/** Test seam. */
export function setOsmProvider(provider: OsmProvider | null): void {
  instance = provider;
}
