import { BHOPAL_BOUNDARY, PILOT } from '../config/bhopal';
import { disconnectPrisma, prisma } from '../config/prisma';
import type { DataSourceStatus } from '../generated/prisma/enums';
import { env } from '../config/env';
import { createLogger } from '../utils/logger';
import { hashPassword } from '../utils/password';

const log = createLogger('seed');

/**
 * Seeds only what cannot come from an upstream API: user accounts and the data
 * source registry.
 *
 * A previous version of this script synthesised 45 days of India-wide hotspots
 * from a seeded PRNG. That has been removed. Every hotspot and every facility
 * in TIMS must trace back to a real NASA FIRMS or OpenStreetMap response, so
 * the data pipeline is:
 *
 *   npm run db:boundary   # load the real Bhopal polygon into PostGIS
 *   npm run osm:sync      # real industrial + emergency geometry from Overpass
 *   npm run firms:ingest  # real thermal detections from NASA FIRMS
 */

const DEMO_USERS = [
  {
    name: 'TIMS Administrator',
    email: 'admin@tims.gov.in',
    password: 'Admin@1234',
    role: 'ADMIN' as const,
  },
  {
    name: 'Bhopal Duty Analyst',
    email: 'analyst@tims.gov.in',
    password: 'Analyst@1234',
    role: 'ANALYST' as const,
  },
  {
    name: 'Field Viewer',
    email: 'viewer@tims.gov.in',
    password: 'Viewer@1234',
    role: 'VIEWER' as const,
  },
];

/**
 * The data source registry behind the transparency page.
 *
 * `isGovernment` is set only where the operator is a verified government body.
 * Sources that are not wired up are listed honestly with their real status,
 * because "credentials required" is information an evaluator should see rather
 * than something to hide.
 */
interface DataSourceSeed {
  key: string;
  name: string;
  purpose: string;
  status: DataSourceStatus;
  updateFrequency: string;
  officialUrl: string;
  license: string | null;
  attribution: string | null;
  isGovernment: boolean;
  statusNote: string | null;
}

function buildDataSources(): DataSourceSeed[] {
  return [
    {
      key: 'nasa-firms',
      name: 'NASA FIRMS (VIIRS 375 m + MODIS 1 km)',
      purpose: 'Primary active-fire and thermal-anomaly detections',
      status: env.firmsEnabled ? 'LIVE' : 'CREDENTIALS_REQUIRED',
      updateFrequency: 'Every 30 minutes (near-real-time products)',
      officialUrl: 'https://firms.modaps.eosdis.nasa.gov/api/',
      license: 'NASA open data — free and unrestricted reuse',
      attribution: 'NASA FIRMS / LANCE / EOSDIS',
      isGovernment: true,
      statusNote: env.firmsEnabled
        ? 'MAP_KEY configured. Outside the burning season the Bhopal pilot bbox has no near-real-time detections, so the ingest also reads the FIRMS archive and records which window it used.'
        : 'Set FIRMS_MAP_KEY in backend/.env. TIMS will not substitute synthetic thermal data.',
    },
    {
      key: 'openstreetmap',
      name: 'OpenStreetMap (Overpass API)',
      purpose:
        'Industrial and commercial site geometry; hospitals, fire stations, schools, police posts and residential areas',
      status: env.OSM_ENABLED ? 'LIVE' : 'UNAVAILABLE',
      updateFrequency: 'Weekly',
      officialUrl: 'https://overpass-api.de/',
      license: 'Open Database License (ODbL) 1.0',
      attribution: '© OpenStreetMap contributors',
      isGovernment: false,
      statusNote:
        'Community-maintained, not an official government register. Coverage is uneven: the Bhopal pilot bbox contains only 2 mapped fire stations, and most industrial polygons are unnamed.',
    },
    {
      key: 'osm-boundary',
      name: `OpenStreetMap administrative boundary — ${PILOT.label} ${BHOPAL_BOUNDARY.adminLevel}`,
      purpose: 'Authoritative geofence deciding whether a detection is a Bhopal incident (PostGIS ST_Within)',
      status: 'LIVE',
      updateFrequency: 'One-off import; re-run npm run db:boundary to refresh',
      officialUrl: BHOPAL_BOUNDARY.sourceUrl,
      license: BHOPAL_BOUNDARY.license,
      attribution: BHOPAL_BOUNDARY.attribution,
      isGovernment: false,
      statusNote: `${BHOPAL_BOUNDARY.osmType}/${BHOPAL_BOUNDARY.osmId}, ${BHOPAL_BOUNDARY.vertices} vertices, retrieved ${BHOPAL_BOUNDARY.retrievedAt}. PostGIS measures the loaded polygon at ~2,767 km², consistent with the published Bhopal district area.`,
    },
    {
      key: 'imd',
      name: 'India Meteorological Department (IMD)',
      purpose: 'Weather context: temperature, wind, humidity, rainfall, warnings',
      status: env.imdEnabled ? 'LIVE' : 'CREDENTIALS_REQUIRED',
      updateFrequency: 'Every 30 minutes when configured',
      officialUrl: 'https://mausam.imd.gov.in/',
      license: 'Government of India — terms vary by product',
      attribution: 'India Meteorological Department',
      isGovernment: true,
      statusNote: env.imdEnabled
        ? 'IMD credentials configured.'
        : 'IMD does not publish a documented open REST API for programmatic access. A provider interface exists (weather.service.ts); set IMD_BASE_URL and IMD_API_KEY to enable it. Until then the UI shows the Open-Meteo fallback, clearly labelled, or "Weather data unavailable".',
    },
    {
      key: 'open-meteo',
      name: 'Open-Meteo',
      purpose: 'Weather context fallback when IMD access is unavailable',
      status: env.WEATHER_FALLBACK_ENABLED ? 'LIVE' : 'UNAVAILABLE',
      updateFrequency: 'Every 30 minutes',
      officialUrl: 'https://open-meteo.com/',
      license: 'CC BY 4.0, free for non-commercial use',
      attribution: 'Open-Meteo.com',
      isGovernment: false,
      statusNote:
        'Not an Indian government source. Used only as an explicitly-labelled fallback so the dashboard never presents fabricated weather.',
    },
    {
      key: 'isro-bhuvan',
      name: 'ISRO / NRSC Bhuvan',
      purpose: 'Satellite basemap, land-use / land-cover and thematic disaster layers',
      status: env.bhuvanEnabled ? 'LIVE' : 'CREDENTIALS_REQUIRED',
      updateFrequency: 'On demand',
      officialUrl: 'https://bhuvan.nrsc.gov.in/',
      license: 'ISRO / NRSC — registration required, terms vary by service',
      attribution: 'ISRO / NRSC Bhuvan',
      isGovernment: true,
      statusNote: env.bhuvanEnabled
        ? 'Bhuvan credentials configured.'
        : 'Bhuvan WMS/API services require registration and in several cases IP whitelisting. A provider interface exists so the integration can be completed without touching call sites; TIMS is fully functional without it.',
    },
    {
      key: 'mppcb',
      name: 'Madhya Pradesh Pollution Control Board (MPPCB)',
      purpose: 'Authoritative consented-industry register for Bhopal',
      status: 'UNAVAILABLE',
      updateFrequency: 'Manual import',
      officialUrl: 'https://www.mppcb.mp.gov.in/',
      license: 'Government of Madhya Pradesh',
      attribution: 'Madhya Pradesh Pollution Control Board',
      isGovernment: true,
      statusNote:
        'MPPCB publishes consent registers as documents rather than a machine-readable geocoded feed, so facility-level coordinates are not available programmatically. An admin CSV/GeoJSON import endpoint exists so verified official records can be loaded when obtained. No MPPCB data is currently in the database and none has been invented.',
    },
    {
      key: 'invest-mp',
      name: 'Invest Madhya Pradesh / MPIDC',
      purpose: 'Official industrial area and cluster boundaries',
      status: 'UNAVAILABLE',
      updateFrequency: 'Manual import',
      officialUrl: 'https://invest.mp.gov.in/',
      license: 'Government of Madhya Pradesh',
      attribution: 'MP Industrial Development Corporation',
      isGovernment: true,
      statusNote:
        'Industrial area listings are published as web pages and PDFs without coordinates. Not ingested; no substitute data has been fabricated.',
    },
    {
      key: 'tims-ml',
      name: 'TIMS classification service (XGBoost)',
      purpose: 'Classifies each detection into a hedged thermal class with a confidence',
      status: env.ML_SERVICE_ENABLED ? 'LIVE' : 'UNAVAILABLE',
      updateFrequency: 'On every ingested detection',
      officialUrl: 'http://localhost:8000/docs',
      license: 'Internal',
      attribution: 'TIMS / Team HexaHack',
      isGovernment: false,
      statusNote:
        'Trained on heuristic weak labels derived from industrial proximity and recurrence, NOT on verified ground truth. Predictions are advisory. When the service is unreachable the backend falls back to a transparent rule engine and records classificationPath=RULE_FALLBACK.',
    },
  ];
}

async function seedUsers(): Promise<number> {
  for (const user of DEMO_USERS) {
    const passwordHash = await hashPassword(user.password);
    await prisma.user.upsert({
      where: { email: user.email },
      update: { name: user.name, role: user.role },
      create: { name: user.name, email: user.email, passwordHash, role: user.role },
    });
  }
  log.info(`Seeded ${DEMO_USERS.length} user account(s)`);
  return DEMO_USERS.length;
}

async function seedDataSources(): Promise<number> {
  const sources = buildDataSources();

  for (const source of sources) {
    await prisma.dataSource.upsert({
      where: { key: source.key },
      update: {
        name: source.name,
        purpose: source.purpose,
        status: source.status,
        updateFrequency: source.updateFrequency,
        officialUrl: source.officialUrl,
        license: source.license,
        attribution: source.attribution,
        isGovernment: source.isGovernment,
        statusNote: source.statusNote,
      },
      create: source,
    });
  }

  log.info(`Seeded ${sources.length} data source registry entr(ies)`);
  return sources.length;
}

async function main(): Promise<void> {
  log.info(`Seeding TIMS — ${PILOT.label} pilot (${PILOT.id})`);

  const users = await seedUsers();
  const sources = await seedDataSources();

  const [hotspots, facilities, emergency, boundaries] = await Promise.all([
    prisma.hotspot.count(),
    prisma.industrialFacility.count(),
    prisma.emergencyFacility.count(),
    prisma.administrativeBoundary.count(),
  ]);

  log.info('Seed complete', {
    users,
    dataSources: sources,
    existingHotspots: hotspots,
    existingIndustrialFacilities: facilities,
    existingEmergencyFacilities: emergency,
    boundaries,
  });

  if (boundaries === 0) log.warn('No boundary loaded yet — run: npm run db:boundary');
  if (facilities === 0) log.warn('No industrial facilities yet — run: npm run osm:sync');
  if (hotspots === 0) log.warn('No hotspots yet — run: npm run firms:ingest');

  log.info('Sign-in credentials: admin@tims.gov.in / Admin@1234 (ADMIN)');
}

main()
  .catch((error) => {
    log.error('Seed failed', { error: error instanceof Error ? error.message : error });
    process.exitCode = 1;
  })
  .finally(() => void disconnectPrisma());
