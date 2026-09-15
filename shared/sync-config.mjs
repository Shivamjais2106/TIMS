/**
 * Generates the per-app Bhopal scoping modules from shared/bhopal.config.json.
 *
 * Why generate instead of importing a shared module directly? backend/ and
 * frontend/ are deployed independently (Render and Vercel respectively), each
 * with its own directory as the build root, so neither can reach `../shared` at
 * build time. Generating a checked-in file into each app keeps a single source
 * of truth without breaking either deployment.
 *
 *   npm run sync:config           # write
 *   npm run sync:config:check     # verify in sync (CI)
 *
 * Lives beside the config it reads rather than in a scripts/ directory of its
 * own: it is the only build script in the project, and keeping the source of
 * truth and its generator together makes the relationship obvious.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// This file lives in shared/, so the repository root is one level up.
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const checkOnly = process.argv.includes('--check');

const config = JSON.parse(readFileSync(join(root, 'shared/bhopal.config.json'), 'utf8'));

/** Strips the `$comment` documentation keys so they never reach app code. */
function strip(value) {
  if (Array.isArray(value)) return value.map(strip);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== '$comment')
        .map(([key, inner]) => [key, strip(inner)]),
    );
  }
  return value;
}

const c = strip(config);
const j = (value) => JSON.stringify(value);

const HEADER = `// ---------------------------------------------------------------------------
// GENERATED FILE — DO NOT EDIT.
//
// Source:    shared/bhopal.config.json
// Regenerate: npm run sync:config   (from the repository root)
//
// TIMS Bhopal pilot scoping. Every FIRMS fetch, Overpass fetch, PostGIS query
// and Leaflet default reads its geography from here.
// ---------------------------------------------------------------------------
`;

const BODY = `
/** Pilot identity, used for the "TIMS / BHOPAL-01" wordmark and report headers. */
export const PILOT = ${j(c.pilot)} as const;

/**
 * The pilot fetch envelope, exactly as specified in the SIH26162 brief.
 *
 * This is an API-level pre-filter for FIRMS and Overpass. It is NOT the
 * authoritative geofence — a detection only counts as a Bhopal incident once
 * PostGIS ST_Within places it inside BHOPAL_BOUNDARY.
 */
export const BHOPAL_BBOX = ${j(c.bbox)} as const;

/** Envelope of the full OSM district polygon — swap in to widen the pilot. */
export const BHOPAL_DISTRICT_BBOX = ${j(c.districtBbox)} as const;

/** Provenance of the authoritative geofence polygon. */
export const BHOPAL_BOUNDARY = ${j(c.boundary)} as const;

/** Leaflet defaults: centre, zoom and clamps. */
export const MAP_DEFAULTS = ${j(c.map)} as const;

/** Named thresholds for the risk engine and the ML weak-labeller. */
export const THRESHOLDS = ${j(c.thresholds)} as const;

/**
 * Classification thresholds, derived from the observed distribution of real
 * FIRMS detections for this pilot area rather than chosen a priori.
 */
export const CLASSIFICATION = ${j(c.classification)} as const;

/** Rule-based risk scoring weights. Sum to 100. */
export const RISK_WEIGHTS = ${j(c.riskWeights)} as const;

/** Inclusive lower bound of each risk band. */
export const RISK_BANDS = ${j(c.riskBands)} as const;

/** FIRMS product and day-range limits, verified against the live API. */
export const FIRMS_LIMITS = ${j(c.firms)} as const;

/** FIRMS \`area\` parameter form: "minLng,minLat,maxLng,maxLat". */
export const BHOPAL_BBOX_PARAM =
  \`\${BHOPAL_BBOX.minLng},\${BHOPAL_BBOX.minLat},\${BHOPAL_BBOX.maxLng},\${BHOPAL_BBOX.maxLat}\`;

/** Leaflet \`bounds\` form: [[south, west], [north, east]], lightly padded. */
export const BHOPAL_BOUNDS: [[number, number], [number, number]] = [
  [BHOPAL_BBOX.minLat - MAP_DEFAULTS.boundsPadding, BHOPAL_BBOX.minLng - MAP_DEFAULTS.boundsPadding],
  [BHOPAL_BBOX.maxLat + MAP_DEFAULTS.boundsPadding, BHOPAL_BBOX.maxLng + MAP_DEFAULTS.boundsPadding],
];

/** Cheap bbox containment test. Use the PostGIS polygon check for anything authoritative. */
export function isInBhopalBbox(latitude: number, longitude: number): boolean {
  return (
    latitude >= BHOPAL_BBOX.minLat &&
    latitude <= BHOPAL_BBOX.maxLat &&
    longitude >= BHOPAL_BBOX.minLng &&
    longitude <= BHOPAL_BBOX.maxLng
  );
}

/** Buckets a 0-100 risk score using RISK_BANDS. */
export function riskBandFor(score: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
  if (score >= RISK_BANDS.CRITICAL) return 'CRITICAL';
  if (score >= RISK_BANDS.HIGH) return 'HIGH';
  if (score >= RISK_BANDS.MEDIUM) return 'MEDIUM';
  return 'LOW';
}
`;

const targets = [
  { path: join(root, 'backend/src/config/bhopal.ts'), label: 'backend/src/config/bhopal.ts' },
  { path: join(root, 'frontend/lib/bhopal.ts'), label: 'frontend/lib/bhopal.ts' },
];

const contents = HEADER + BODY;
let drift = false;

for (const target of targets) {
  const current = existsSync(target.path) ? readFileSync(target.path, 'utf8') : null;
  if (current === contents) {
    console.log(`  in sync   ${target.label}`);
    continue;
  }
  if (checkOnly) {
    console.error(`  OUT OF SYNC  ${target.label}`);
    drift = true;
    continue;
  }
  writeFileSync(target.path, contents);
  console.log(`  ${current === null ? 'created' : 'updated'}   ${target.label}`);
}

// --- boundary GeoJSON ------------------------------------------------------
// Vendored into the backend so `npm run db:boundary` works on Render, where the
// build root is backend/ and `../shared` is not present.
const geojsonSrc = join(root, 'shared/bhopal-boundary.geojson');
const geojsonDest = join(root, 'backend/prisma/data/bhopal-boundary.geojson');
mkdirSync(dirname(geojsonDest), { recursive: true });

const geojson = readFileSync(geojsonSrc, 'utf8');
const geojsonCurrent = existsSync(geojsonDest) ? readFileSync(geojsonDest, 'utf8') : null;

if (geojsonCurrent === geojson) {
  console.log('  in sync   backend/prisma/data/bhopal-boundary.geojson');
} else if (checkOnly) {
  console.error('  OUT OF SYNC  backend/prisma/data/bhopal-boundary.geojson');
  drift = true;
} else {
  writeFileSync(geojsonDest, geojson);
  console.log(`  ${geojsonCurrent === null ? 'created' : 'updated'}   backend/prisma/data/bhopal-boundary.geojson`);
}

if (checkOnly && drift) {
  console.error('\nRun `npm run sync:config` and commit the result.');
  process.exit(1);
}
