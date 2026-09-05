# TIMS Backend

Express + TypeScript + Prisma API for the Thermal Intelligence & Monitoring System.

## Requirements

- Node.js 20+
- PostgreSQL 14+ **with the PostGIS extension available**

The simplest way to get both is the compose file in the repository root:

```bash
docker compose up -d          # postgis/postgis:16-3.4 on :5432
```

## Installation

```bash
cd backend
npm install
cp .env.example .env
```

Then edit `.env`:

```env
DATABASE_URL="postgresql://tims:tims@localhost:5432/tims?schema=public"
JWT_SECRET="<paste a long random string>"
FRONTEND_URL="http://localhost:3000"
PORT=4000
```

Generate a secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

`.env.example` documents every supported variable, including the optional NASA FIRMS and OSM settings.

## Database setup

```bash
npm run prisma:deploy   # apply migrations (production-safe)
npm run db:seed         # load demo users, facilities, hotspots and alerts
```

During development, `npm run prisma:migrate` creates a new migration from schema changes.

Two migrations ship with the project:

| Migration | Contents |
| --- | --- |
| `20260101000000_init` | Enums, tables, indexes and foreign keys |
| `20260101000100_postgis_geospatial` | `CREATE EXTENSION postgis`, functional GiST indexes, `*_geo` convenience views |

> Prisma 7 keeps the datasource URL in `prisma.config.ts` rather than `schema.prisma`, and generates the
> client into `src/generated/prisma` (gitignored — run `npm run prisma:generate` after cloning).

## Running

```bash
npm run dev       # tsx watch on http://localhost:4000
npm run build     # prisma generate + tsc
npm start         # node dist/server.js
npm run typecheck
```

On boot the server verifies the database connection (exiting if unreachable) and probes for PostGIS.
`GET /api/health` reports both, plus which FIRMS and OSM providers are active.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Development server with reload |
| `npm run build` | Generate the client and compile to `dist/` |
| `npm start` | Run the compiled server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run prisma:generate` | Regenerate the Prisma client |
| `npm run prisma:migrate` | Create and apply a migration (dev) |
| `npm run prisma:deploy` | Apply pending migrations (prod) |
| `npm run prisma:studio` | Browse the database |
| `npm run db:seed` | Seed demo data |
| `npm run db:reset` | Drop, re-migrate and re-seed |
| `npm run firms:ingest` | Run one FIRMS ingest cycle by hand |

## Architecture

```
Route  →  Middleware (auth, zod)  →  Controller  →  Service  →  Prisma  →  PostgreSQL/PostGIS
```

Controllers only parse the validated request, call a service and shape the response. All business logic —
classification, scoring, spatial correlation, alerting — lives in `src/services/`.

### Request flow example

`GET /api/hotspots?eventType=GAS_FLARE&riskLevel=HIGH`

1. `routes/hotspot.routes.ts` — `requireAuth`, then `validate({ query: listHotspotsQuerySchema })`
2. `controllers/hotspot.controller.ts` — reads the parsed query, calls the service, sends the envelope
3. `services/hotspot.service.ts` — builds the Prisma `where`, runs the query and the count in parallel
4. `middleware/error.middleware.ts` — catches anything thrown and maps it to a typed JSON error

### Geospatial layer

`src/services/geo.service.ts` holds every PostGIS query. Each one builds the point with the same expression
the functional GiST indexes were created over:

```sql
ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
```

| Capability | Function | SQL |
| --- | --- | --- |
| Radius search | `findFacilitiesNearPoint`, `findHotspotsNearPoint` | `ST_DWithin` |
| Distance | `distanceBetween`, and the `distanceMeters` column on every result | `ST_Distance` |
| Nearest facility | `findNearestFacility` | KNN `<->` |
| Point in area | `findHotspotsInPolygon` | `ST_GeomFromGeoJSON` + `ST_Contains` |

If PostGIS is missing, `assertPostgis()` throws a 503 with an actionable message. There is deliberately no
JavaScript Haversine fallback — a dashboard showing approximate distances labelled as exact is worse than
one that says the capability is unavailable.

### NASA FIRMS integration

```
FirmsProvider (interface)
├── MockFirmsProvider    firms.mock.ts   deterministic, no network, no key
└── NasaFirmsProvider    firms.api.ts    live CSV endpoint, needs FIRMS_MAP_KEY
```

`getFirmsProvider()` picks the live client only when `FIRMS_MAP_KEY` is set. `firms.service.ts` consumes
whichever it gets and runs the same pipeline:

1. De-duplicate on `externalId` (satellite + acquisition time + rounded coordinates)
2. Count persistence over a 0.01° grid cell across the last 30 days
3. Link the nearest facility with PostGIS
4. Classify and score via `utils/risk.ts`
5. Persist, and raise an alert if the detection crosses the threshold

`runFirmsIngest()` never throws: upstream failures are captured in the returned result and logged.

To go live: request a MAP_KEY at <https://firms.modaps.eosdis.nasa.gov/api/map_key/>, set `FIRMS_MAP_KEY`,
restart. No other change is needed.

### OpenStreetMap integration

Same shape: `MockOsmProvider` (20 curated Indian industrial sites) or `OverpassOsmProvider` (live Overpass
query, enabled with `OSM_ENABLED=true`). `syncFacilities()` upserts on `osmId`, so re-runs update rather than
duplicate and manually created facilities are never touched.

### Scheduled jobs

Disabled by default (`ENABLE_CRON_JOBS=false`) so a dev server does not mutate data unprompted.

| Job | Default schedule | Purpose |
| --- | --- | --- |
| `firmsIngest.job.ts` | `*/30 * * * *` | Fetch and ingest new detections |
| `persistence.job.ts` | `15 * * * *` | Recompute persistence and re-score |
| `osmSync.job.ts` | `0 3 * * 0` | Refresh facilities (only when `OSM_ENABLED`) |

Each guards against overlapping runs and can never crash the process.

### Classification and risk scoring

`src/utils/risk.ts` is the interim rule engine that the Python AI service will replace. Signals: brightness
temperature, fire radiative power, persistence, industrial proximity, detection confidence, day/night.

Composite score out of 100 — thermal 30, radiative power 20, persistence 20, proximity 20, confidence 10,
scaled by an event-type multiplier. Bucketed as LOW &lt; 35 ≤ MEDIUM &lt; 60 ≤ HIGH &lt; 80 ≤ CRITICAL.

When the model service lands it exposes `classifyEventType` / `computeRiskScore` over HTTP and
`hotspot.service.ts` calls that instead. Nothing else changes.

## Security

- bcrypt password hashing, cost 12 (configurable via `BCRYPT_SALT_ROUNDS`)
- JWT bearer tokens, re-validated against the database on every request so a deleted or demoted account
  cannot keep acting on a still-valid token
- Login answers identically for an unknown email and a wrong password, and burns comparable time, so it
  cannot be used to enumerate accounts
- `requireRole` gates every write; deletes are ADMIN-only
- Zod validation on body, query and params
- helmet, an allowlist CORS policy, and rate limiting (600 req / 15 min globally, 20 / 15 min on auth)
- Centralised error handling: 5xx details are logged server-side and never returned in production
- `passwordHash` is excluded from every response by explicit `select`
