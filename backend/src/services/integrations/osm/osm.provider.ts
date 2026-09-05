import { env } from '../../../config/env';
import { MockOsmProvider } from './osm.mock';
import { OverpassOsmProvider } from './osm.overpass';
import type { OsmProvider } from './osm.types';

let instance: OsmProvider | null = null;

/**
 * Returns the active OSM provider.
 *
 * Live Overpass is used only when OSM_ENABLED=true; otherwise the curated mock
 * dataset is served. Nothing downstream branches on which one is active.
 */
export function getOsmProvider(): OsmProvider {
  if (!instance) {
    instance = env.OSM_ENABLED ? new OverpassOsmProvider() : new MockOsmProvider();
  }
  return instance;
}

/** Test seam: lets a test or script swap the provider. */
export function setOsmProvider(provider: OsmProvider | null): void {
  instance = provider;
}
