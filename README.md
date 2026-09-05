# TIMS — Thermal Intelligence & Monitoring System

**Smart India Hackathon 2026 · Problem statement SIH162**
AI-based detection and classification of industrial fires and persistent thermal sources using NASA FIRMS, OpenStreetMap and satellite data.

---

## What this is

Satellites detect every thermal anomaly over India several times a day, but a raw FIRMS feed cannot tell a
refinery flare stack from burning crop stubble. TIMS ingests those detections, correlates them against
industrial geometry in a PostGIS database, tracks how long each source has been burning, and produces a
ranked, explainable event feed.

```
NASA FIRMS ──▶ Node.js / Express ──▶ PostgreSQL + PostGIS ──▶ (AI service) ──▶ Next.js dashboard
  VIIRS/MODIS     ingest, classify,      spatial correlation      planned          operator console
                  score, alert           persistence tracking
```

The AI/ML service is **not implemented yet** — this repository is the frontend + backend foundation it will
plug into. `backend/src/utils/risk.ts` holds the interim rule-based classifier behind the same interface the
model will expose.

---

## Repository layout

```
SIH162/
├── backend/            Express + TypeScript + Prisma API
│   ├── prisma/         schema and SQL migrations (incl. the PostGIS layer)
│   └── src/
│       ├── config/         env validation, Prisma client, PostGIS detection
│       ├── controllers/    HTTP layer — parse, delegate, respond
│       ├── routes/         URL to controller mapping, auth and validation guards
│       ├── services/       all business logic
│       │   └── integrations/   NASA FIRMS and OSM providers (mock + live)
│       ├── middleware/     auth, validation, errors, rate limiting
│       ├── jobs/           node-cron scheduled tasks
│       ├── validators/     zod request schemas
│       ├── utils/          risk scoring, JWT, password hashing, logging
│       ├── scripts/        seed and manual ingest
│       └── app.ts          Express application factory
│
├── frontend/           Next.js App Router dashboard
│   ├── app/            routes (landing, auth, dashboard)
│   ├── components/     ui / layout / map / charts / dashboard / alerts
│   ├── lib/            API client, formatting, constants, demo dataset
│   ├── services/       one module per API resource
│   ├── hooks/          auth, theme, fetching
│   └── types/          shared domain types
│
└── docker-compose.yml  PostgreSQL 16 + PostGIS 3.4 for local development
```

---

## Quick start

Requirements: **Node.js 20+**, **npm**, and either **Docker** or a local **PostgreSQL 14+ with PostGIS**.

```bash
# 1. Install dependencies for both apps
npm run install:all

# 2. Start PostgreSQL + PostGIS
npm run db:up

# 3. Configure the backend
cd backend
cp .env.example .env
#    then set DATABASE_URL to match docker-compose:
#    postgresql://tims:tims@localhost:5432/tims?schema=public
#    and generate a JWT_SECRET:
#    node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
cd ..

# 4. Configure the frontend
cd frontend && cp .env.example .env.local && cd ..

# 5. Apply migrations and load seed data
npm run db:setup

# 6. Run both apps (two terminals)
npm run dev:backend    # http://localhost:4000
npm run dev:frontend   # http://localhost:3000
```

Open <http://localhost:3000> and sign in.

### Seeded accounts

| Role    | Email                  | Password        |
| ------- | ---------------------- | --------------- |
| ADMIN   | `admin@tims.gov.in`    | `Admin@1234`    |
| ANALYST | `analyst@tims.gov.in`  | `Analyst@1234`  |
| VIEWER  | `viewer@tims.gov.in`   | `Viewer@1234`   |

The login page lists these and fills the form when you click one.

The seed generates roughly **1,900 hotspots across 45 days**, 20 real Indian industrial facilities, and the
alerts those detections trigger — enough for every chart and table to be meaningful immediately.

---

## Root scripts

| Command                | What it does                                        |
| ---------------------- | --------------------------------------------------- |
| `npm run install:all`  | Installs backend and frontend dependencies           |
| `npm run db:up`        | Starts the PostGIS container                         |
| `npm run db:down`      | Stops it                                             |
| `npm run db:migrate`   | Applies Prisma migrations                            |
| `npm run db:seed`      | Loads seed data                                      |
| `npm run db:setup`     | Migrate + seed in one step                           |
| `npm run dev:backend`  | Backend in watch mode on :4000                       |
| `npm run dev:frontend` | Frontend in dev mode on :3000                        |
| `npm run build`        | Production build of both apps                        |
| `npm run typecheck`    | TypeScript check across both apps                    |

---

## Design decisions worth knowing

**PostGIS is real, or it says so.**
Latitude and longitude are stored as plain columns; the spatial work (`ST_DWithin`, `ST_Distance`,
`ST_Contains`, KNN `<->`) runs in SQL against *functional GiST indexes* declared in
`prisma/migrations/*_postgis_geospatial/migration.sql`. If the extension is missing, geospatial endpoints
return **503 with an explanation** rather than silently falling back to an approximate JavaScript distance.
`GET /api/geo/status` reports the capability and the dashboard shows it in the map header.

**Mock data flows through the real pipeline.**
The seeder does not insert rows directly. It calls the same `syncFacilities()` and `ingestDetections()`
functions the cron jobs use, driven by a mock provider that satisfies the same interface as the live NASA
provider. Swapping in real FIRMS is a matter of setting `FIRMS_MAP_KEY` — no downstream code changes.

**FIRMS is optional and never fatal.**
`getFirmsProvider()` returns the live NASA client only when a MAP_KEY is present. Provider failures are
caught, logged and returned in the job result; the API stays up.

**No client state library.**
The dashboard is read-mostly with a handful of endpoints, so `hooks/useApi.ts` (about 60 lines) covers
loading / error / data and stale-response cancellation. Redux would have been more ceremony than the problem
justifies.

---

## API surface

All routes are prefixed with `/api`. Everything except `/api/health` and `/api/geo/status` requires a bearer token.

| Method | Route | Role | Purpose |
| --- | --- | --- | --- |
| GET | `/health` | public | Liveness plus which providers are live |
| POST | `/auth/signup` | public | Register (VIEWER or ANALYST) |
| POST | `/auth/login` | public | Obtain a JWT |
| GET | `/auth/me` | any | Current user |
| POST | `/auth/logout` | any | Session teardown hook |
| GET | `/hotspots` | any | Filter, sort and paginate detections |
| GET | `/hotspots/recent` | any | Latest 8 detections |
| GET | `/hotspots/:id` | any | One detection |
| GET | `/hotspots/:id/nearby-facilities` | any | PostGIS radius search around a detection |
| POST | `/hotspots` | ANALYST, ADMIN | Create (auto-classified and scored) |
| PATCH | `/hotspots/:id` | ANALYST, ADMIN | Update and re-score |
| DELETE | `/hotspots/:id` | ADMIN | Delete |
| GET | `/industries` | any | Filter, sort and paginate facilities |
| GET | `/industries/summary` | any | Facilities ranked by thermal activity |
| GET | `/industries/:id` | any | Facility profile with recent detections |
| POST | `/industries` | ANALYST, ADMIN | Create |
| PATCH | `/industries/:id` | ANALYST, ADMIN | Update |
| DELETE | `/industries/:id` | ADMIN | Delete |
| GET | `/alerts` | any | Filter and paginate alerts |
| GET | `/alerts/recent` | any | Latest 5, unread first |
| GET | `/alerts/unread-count` | any | Totals by severity |
| PATCH | `/alerts/:id/read` | any | Acknowledge one |
| PATCH | `/alerts/read-all` | any | Acknowledge all |
| POST | `/alerts` | ANALYST, ADMIN | Create manually |
| GET | `/analytics/summary` | any | Dashboard stat tiles with period deltas |
| GET | `/analytics/trends` | any | Time series, gap-filled |
| GET | `/analytics/categories` | any | Breakdown by class, risk, region, facility type |
| GET | `/geo/status` | public | PostGIS availability |
| GET | `/geo/facilities/near` | any | Facilities within a radius |
| GET | `/geo/facilities/nearest` | any | Nearest facility (KNN) |
| GET | `/geo/hotspots/near` | any | Detections within a radius |
| POST | `/geo/hotspots/in-area` | any | Point-in-polygon over GeoJSON |

Successful responses are `{ success: true, data, meta? }`; failures are
`{ success: false, error: { code, message, details? } }`.

---

## What is deliberately not here

- **The Python AI/ML service.** Out of scope for this stage. `utils/risk.ts` is the seam it will replace.
- **MongoDB, Firebase, Redux.** Excluded by design.
- **Live NASA FIRMS and Overpass calls by default.** Both clients are fully written
  (`firms.api.ts`, `osm.overpass.ts`) but gated behind `FIRMS_MAP_KEY` and `OSM_ENABLED` so the project
  runs with zero external credentials.

---

## Further reading

- [`backend/README.md`](backend/README.md) — database setup, migrations, jobs, FIRMS integration
- [`frontend/README.md`](frontend/README.md) — pages, components, theming, demo mode

Thermal data courtesy of **NASA FIRMS**. Facility geometry © **OpenStreetMap** contributors.
