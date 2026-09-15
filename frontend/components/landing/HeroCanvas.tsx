'use client';

import dynamic from 'next/dynamic';

/**
 * Client boundary for the Three.js hero.
 *
 * `ssr: false` is only permitted inside a Client Component, and Three.js
 * touches `window` at import time so it cannot be server-rendered. Keeping this
 * wrapper one line long means the landing page itself stays a Server Component
 * and the ~150 kB of WebGL code never reaches any other route's bundle.
 */
const HeroVisual = dynamic(() => import('./HeroVisual'), {
  ssr: false,
  // No loading state: the hero is decorative, and a spinner in its place would
  // draw more attention than the visual it replaces.
  loading: () => null,
});

export function HeroCanvas() {
  return <HeroVisual />;
}
