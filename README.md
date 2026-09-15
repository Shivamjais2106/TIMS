<div align="center">

# TIMS

**Thermal Intelligence & Monitoring System**
Bhopal Thermal Risk & Emergency Intelligence Platform

Smart India Hackathon 2026 · Problem statement **SIH26162** · NTRO, Disaster Management
Team **HexaHack**

`Detect → Understand → Assess Risk → Identify Impact → Support Response`

</div>

---

## What this is

Satellites see every thermal anomaly over Bhopal, but cannot tell a brick kiln from burning
crop residue. TIMS ingests NASA FIRMS detections, geofences them against the real Bhopal
district polygon in PostGIS, correlates them with OpenStreetMap industrial and emergency
geometry, classifies them with a trained XGBoost model, scores their risk transparently, and
pushes high-priority alerts to a live operator console.

> [!IMPORTANT]
> **Decision support, not dispatch.** TIMS does not predict fires, does not confirm causes,
> and does not estimate affected population. It is not an official emergency alerting
> system. See [What TIMS does not claim](#what-tims-does-not-claim) — the limits are part of
> the design, not a disclaimer bolted on.

---

## Table of contents

- [Verified run](#verified-run)
- **[Running locally → RUNNING.md](./RUNNING.md)**
- [Trained model](#trained-model)
- [Quick start](#quick-start)
- [Repository layout](#repository-layout) — *why there are two ML folders*
- [Architecture](#architecture)
- [Bhopal scoping](#bhopal-scoping)
- [Data sources](#data-sources)
- [API](#api)
- [Commands](#commands)
- [Environment](#environment)
- [Bugs found during this build](#bugs-found-during-this-build)
- [What TIMS does not claim](#what-tims-does-not-claim)
- [Deployment](#deployment)

---

## Verified run

Every figure is measured, not asserted. Reproduce with `npm run verify` — it prints these
numbers and exits non-zero if any check fails.

| Metric | Value |
|---|---|
| FIRMS detections ingested | **1,294** — VIIRS S-NPP 618 · VIIRS NOAA-20 605 · MODIS 71 |
| Rejected by `ST_Within` geofence | **65** — inside the fetch bbox, outside the district polygon |
| Synthetic records in the database | **0** |
| Industrial sites (OpenStreetMap) | **82** — incl. BHEL, Sanchi Milk Factory, CPRI |
| Emergency facilities (OpenStreetMap) | **415** — 312 hospital · 71 school · 27 police · 3 shelter · 2 fire station |
| Boundary polygon | OSM `relation/1976080`, 7,217 vertices |
| Polygon area, measured by PostGIS | **2,767 km²** vs ~2,772 km² published — geometry verified, not assumed |
| Detections classified by the model | **1,294 / 1,294** (zero rule fallbacks) |
| Risk assessments with full explanations | **3,022 / 3,022** |
| **Verification checks** | **18 / 18 passed** |

Observed signal characteristics, which is why the thresholds are what they are:

```
FRP (MW)                p25 1.11   p50 2.43   p75 7.74   p90 15.44   max 136.15
brightness (K)          p50 317.9  p90 350.9  max 367.0
distance to industry    p10 2,687 m   p50 5,942 m   max 19,022 m
within 1 km / 3 km      61 / 154 of 1,294
persistence             max 7 days · 212 sources recurring on 3+ days
```

---

## Trained model

XGBoost, selected over Random Forest on **5-fold cross-validated macro F1** rather than the
single split. With roughly six rows per minority class in a 20% test set, one
misclassification swings that class's recall by 17 points — the two metrics disagreed here,
and the cross-validated estimate is the defensible one.

| Model | Accuracy | Macro F1 | CV macro F1 |
|---|---|---|---|
| **XGBoost — selected** | 0.9730 | 0.8911 | **0.9090 ± 0.0825** |
| Random Forest — baseline | 0.9807 | 0.9215 | 0.8710 ± 0.1066 |

Per class, held-out test set (n = 259):

| Class | Precision | Recall | F1 | Support |
|---|---|---|---|---|
| `POSSIBLE_VEGETATION_FIRE` | 0.991 | 0.981 | 0.986 | 214 |
| `POSSIBLE_AGRICULTURAL_BURN` | 0.941 | 0.970 | 0.955 | 33 |
| `POSSIBLE_PERSISTENT_THERMAL_SOURCE` | 1.000 | 0.833 | 0.909 | 6 |
| `POSSIBLE_INDUSTRIAL_FIRE` | 0.625 | 0.833 | 0.714 | 6 |

Feature importance: `recurrence_count` 0.359 · `distance_to_facility_m` 0.266 ·
`is_night` 0.245 · `frp` 0.085 · `brightness` 0.045

> [!WARNING]
> **Read these numbers with two caveats.** Both are documented at length in
> `ml/reports/model_report.md`.
>
> 1. **The labels are heuristic weak labels, not ground truth.** No fire-service incident
>    log, MPPCB inspection record or image-confirmed fire perimeter exists for these
>    detections. The metrics measure *agreement with the rules in `ml/weak_labels.py`*, not
>    real-world correctness.
> 2. **The task is partly circular.** `distance_to_facility_m` is both a labelling rule and
>    a model feature, so a high score partly reflects the model recovering thresholds it was
>    trained on.
>
> The model's real value is making that labelling logic available as a fast, versioned
> service with a confidence value — not proving the classification is correct.

---

## Quick start

**Prerequisites:** Node 20+, Python 3.12+, Docker, and a free
[NASA FIRMS MAP_KEY](https://firms.modaps.eosdis.nasa.gov/api/map_key/) (instant, email only).

```bash
# 1 — Infrastructure: PostGIS, and the ML service container
docker compose up -d

# 2 — Dependencies
npm run install:all
pip install -r ml/requirements.txt

# 3 — Credentials. TIMS will NOT substitute synthetic data for a missing key:
#     it fails loudly instead. Set FIRMS_MAP_KEY in backend/.env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local

# 4 — Database: migrate, load the real Bhopal polygon, seed users + source registry
npm run setup

# 5 — Real data: OpenStreetMap facilities, then NASA FIRMS detections
npm run pipeline

# 6 — Train the model on what was just ingested
npm run ml:train

# 7 — Run it
npm run dev:backend      # http://localhost:4000
npm run dev:frontend     # http://localhost:3000

# 8 — Confirm the whole thing, with real numbers
npm run verify
```

Sign in as `admin@tims.gov.in` / `Admin@1234`. Only **ADMIN** can trigger a manual data sync.

> [!TIP]
> **[RUNNING.md](./RUNNING.md)** has the full local guide — per-service startup, a suggested
> demo flow, how to prove live alerts work, and troubleshooting for every failure mode hit
> while building this.

<details>
<summary><b>Running the ML service without Docker</b></summary>

```bash
npm run ml:serve     # uvicorn on :8000, reads ml/models/classifier.joblib
```

The backend degrades gracefully if it is absent: classification falls back to the
transparent rule engine and every affected record is stamped `RULE_FALLBACK`, so the UI
never implies a model prediction that did not happen.

</details>

---

## Repository layout

```
shared/                     SINGLE SOURCE OF TRUTH
  bhopal.config.json          pilot geography, thresholds, risk weights
  bhopal-boundary.geojson      real OSM district polygon (7,217 vertices)
  sync-config.mjs              generates the per-app config; --check for CI

backend/                    Express API · Prisma · ingest · cron · Socket.io
ml/                         Model TRAINING pipeline (dev-time)
ml-service/                 Model SERVING container (deployed)
frontend/                   Next.js operator console
```

### Why two ML folders

This is the most common question about the layout, and the split is deliberate:

| | `ml/` | `ml-service/` |
|---|---|---|
| **Purpose** | Trains the model | Serves the model |
| **When it runs** | Development, on demand | Continuously, in production |
| **Needs a database?** | Yes — reads PostgreSQL directly | No — only the model file |
| **Dependencies** | pandas, matplotlib, psycopg, sklearn, xgboost | fastapi, uvicorn, sklearn, xgboost |
| **Ships in the image?** | No | Yes |

Keeping them apart means the deployed container does not carry pandas, matplotlib or a
database driver it will never use, and the training scripts are not exposed on a public
service. The brief also asks for an `ml-service/` directory specifically (Part 4, step 9).

**The model exists in exactly one place** — `ml/models/classifier.joblib`. The Docker image
builds from the repository root and copies it in, so there is no duplicated artefact:

```dockerfile
COPY ml/models/classifier.joblib ml/models/model_metadata.json /app/models/
```

<details>
<summary><b>Why the boundary GeoJSON appears twice</b></summary>

`shared/bhopal-boundary.geojson` is the source. `backend/prisma/data/bhopal-boundary.geojson`
is a generated copy, written by `npm run sync:config`.

The copy exists because Render deploys the backend with `backend/` as its root directory, so
`../shared/` is not present in the deployed tree. Rather than restructure the deployment, the
sync script vendors the file and `--check` fails CI if the two drift apart. It is a build
artefact that happens to be tracked, not a hand-maintained duplicate.

</details>

---

## Architecture

```
NASA FIRMS  (VIIRS 375 m + MODIS 1 km)      OpenStreetMap / Overpass
  bbox 77.30,23.10 → 77.55,23.35              industrial + emergency geometry
            │                                          │
            └────────────────┬─────────────────────────┘
                             ▼
                  Node / Express ingest
                  node-cron · every 30 min
                             │
                             ▼
              PostgreSQL 16 + PostGIS 3.4
                ST_Within    is this actually a Bhopal incident?
                ST_Distance  metres to nearest industrial site (KNN + GiST)
                ST_DWithin   recurrence count · impact-zone exposure
                             │
                             ▼
                FastAPI + XGBoost  →  hedged class + confidence
                       │ unreachable?
                       └──▶ transparent rule engine, stamped RULE_FALLBACK
                             │
                             ▼
            Weighted risk score (30/20/20/20/10) + reasons[]
                             │
                ┌────────────┴────────────┐
                ▼                         ▼
        Socket.io push              Next.js console
        HIGH / CRITICAL             Leaflet · Recharts · GSAP
```

### Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), TypeScript, Tailwind v4, Leaflet, Recharts, GSAP, Three.js / react-three-fiber *(landing page only)* |
| Theming | Dark (default) and light, switchable in the header; persisted, with a no-flash bootstrap |
| Backend | Node.js, Express 5, TypeScript, JWT + bcrypt, Socket.io, node-cron |
| Database | PostgreSQL 16 + PostGIS 3.4, Prisma 7 |
| ML | Python 3.12+, pandas, XGBoost (primary) + Random Forest (baseline), FastAPI |
| Deployment | Docker (ML service), Render (backend + DB), Vercel (frontend) |

### Data model

`User` · `Hotspot` · `IndustrialFacility` · `EmergencyFacility` · `AdministrativeBoundary` ·
`RiskAssessment` · `Alert` · `WeatherObservation` · `DataSource` · `Report`

Prisma cannot model a PostGIS `geometry` column, so the district polygon lives in a `geom`
column added by migration and is only ever touched through raw SQL. Point geometry uses
*functional* GiST indexes over `ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography` — every
spatial query builds the point with that exact expression, so the planner can use them.

---

## Bhopal scoping

`shared/bhopal.config.json` is the only place pilot geography is defined.
`npm run sync:config` generates `backend/src/config/bhopal.ts` and `frontend/lib/bhopal.ts`
from it, so the FIRMS fetcher, the Overpass fetcher, every PostGIS query and the Leaflet
defaults cannot drift apart.

```js
const BHOPAL_BBOX = { minLng: 77.30, minLat: 23.10, maxLng: 77.55, maxLat: 23.35 };
```

**The bbox is a cheap API-level pre-filter. The authoritative geofence is the polygon.**
65 of 1,359 fetched detections sat inside the bbox but outside the district and were
correctly excluded — which is the whole reason for loading a real 7,217-vertex boundary
rather than comparing four numbers.

To scale beyond Bhopal, change that one file and re-run `npm run sync:config`.

---

## Data sources

| Source | Purpose | Status |
|---|---|---|
| **NASA FIRMS** | Thermal anomalies (VIIRS 375 m, MODIS 1 km) | 🟢 Live |
| **OpenStreetMap / Overpass** | Industrial sites; hospitals, fire stations, schools, police | 🟢 Live |
| **OSM `relation/1976080`** | Bhopal district geofence polygon | 🟢 Live |
| **Open-Meteo** | Weather context fallback, labelled non-official | 🟢 Live |
| IMD | Weather context (authoritative) | 🟠 Credentials required — no documented open REST API |
| ISRO / NRSC Bhuvan | Satellite basemap, land-use layers | 🟠 Credentials required — registration + IP whitelisting |
| MPPCB | Official consented-industry register | 🔴 Unavailable — published as documents, not a geocoded feed |
| Invest MP / MPIDC | Official industrial area boundaries | 🔴 Unavailable — no coordinates published |

Sources that are **not** wired up are listed with their real status rather than omitted.
`/dashboard/sources` renders this register live beside actual row counts, so a "Live" claim
can be checked against data that exists.

> [!NOTE]
> OpenStreetMap is community-maintained, not an official register, and coverage is uneven:
> only **2 fire stations** are mapped inside the pilot area, which is certainly an
> undercount. The UI says so wherever "nearest fire station" is shown.

---

## API

<details>
<summary><b>Endpoints</b></summary>

```
GET    /api/health                        capability probe — honest about what is live

POST   /api/auth/signup                   ANALYST / VIEWER only; ADMIN is not self-assignable
POST   /api/auth/login
GET    /api/auth/me

GET    /api/hotspots                      filter · sort · paginate
GET    /api/hotspots/:id
GET    /api/hotspots/:id/nearby-facilities
GET    /api/hotspots/recent

GET    /api/industries                    GET /api/industries/:id · /summary
GET    /api/emergency                     GET /api/emergency/hospitals · /fire-stations · /near
GET    /api/emergency/response/:hotspotId emergency response panel payload

GET    /api/impact/:hotspotId             1 / 3 / 5 km exposure counts
GET    /api/risk  (via hotspot payload)   score + level + reasons[] + components
GET    /api/boundaries/bhopal             polygon + provenance
GET    /api/weather                       IMD → Open-Meteo → honest "unavailable"
GET    /api/datasources                   transparency register + live row counts
GET    /api/config                        pilot scoping the UI renders

GET    /api/alerts                        severity + status filters
PATCH  /api/alerts/:id/acknowledge        auditable triage — ANALYST or ADMIN
PATCH  /api/alerts/:id/status             resolve / dismiss
GET    /api/alerts/status-counts

GET    /api/analytics/summary             /trends · /categories
GET    /api/reports                       POST to generate · GET /:id

POST   /api/admin/sync/firms              ADMIN only
POST   /api/admin/sync/osm                ADMIN only
POST   /api/admin/recompute               ADMIN only

WS     /socket.io                         new-alert · alert-acknowledged · ingest-status
```

</details>

---

## Commands

<details open>
<summary><b>Root</b></summary>

```bash
npm run setup               # migrate + load boundary + seed
npm run pipeline            # OSM sync + FIRMS ingest
npm run verify              # end-to-end verification, real numbers
npm run ml:train            # export → clean/EDA → weak labels → train
npm run sync:config         # regenerate per-app config from shared/
npm run sync:config:check   # CI: fail if generated files have drifted
npm run typecheck           # backend + frontend
npm run build               # backend + frontend
```

</details>

<details>
<summary><b>Backend</b></summary>

```bash
npm run db:boundary                 # load the real Bhopal polygon into PostGIS
npm run osm:sync                    # Overpass industrial + emergency facilities
npm run firms:ingest                # NRT first, logged archive fallback
npm run firms:ingest -- --archive   # force the multi-season archive sweep
npm run db:recompute -- --all       # persistence + geofence flags, no API calls
npm run ml:reclassify               # re-run classification after a retrain
npm run db:purge-synthetic          # dry run; add -- --apply to delete
```

</details>

<details>
<summary><b>ML</b></summary>

```bash
python ml/export_data.py    # real rows + PostGIS features → CSV
python ml/clean_eda.py      # cleaning + EDA report
python ml/weak_labels.py    # heuristic weak labels + rationale
python ml/train_model.py    # XGBoost + Random Forest, metrics, artefact
```

Outputs land in `ml/reports/` — EDA summary, weak-label rationale with its known biases, and
the model report with both confusion matrices.

</details>

---

## Environment

`backend/.env` — copy from `.env.example`:

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL with PostGIS available |
| `JWT_SECRET` | ✅ | 16+ characters |
| `FIRMS_MAP_KEY` | ✅ | Free from NASA. **No synthetic fallback exists** — a missing key fails loudly |
| `FIRMS_DAY_RANGE` | — | **1–5 only**; FIRMS rejects anything larger with HTTP 400 |
| `ML_SERVICE_URL` | — | Default `http://localhost:8000` |
| `OSM_USER_AGENT` | — | Overpass returns 406 without one |
| `IMD_API_KEY` / `IMD_BASE_URL` | — | Weather degrades honestly without them |
| `BHUVAN_API_KEY` / `BHUVAN_BASE_URL` | — | Application works fully without |
| `DEMO_MODE` | — | Explicit opt-in only, never an automatic fallback |
| `ENABLE_CRON_JOBS` | — | `true` runs FIRMS ingest every 30 minutes |

`frontend/.env.local` needs only `NEXT_PUBLIC_API_URL`. There is deliberately no frontend
demo flag: `DEMO_MODE` is a *backend* setting, the server reports it on `/api/health`, and the
UI renders a persistent **DEMO DATA** banner in response. The client never invents records.

---

## Bugs found during this build

Recorded because each would have failed silently in a demo:

| # | Bug | Consequence |
|---|---|---|
| 1 | `FIRMS_DAY_RANGE` validated up to 10 | FIRMS rejects >5 with `HTTP 400 Invalid day range. Expects [1..5]` — **every** scheduled ingest would have failed |
| 2 | Persistence recompute anchored to wall-clock time | With archive data months old, a `now − 30 days` window selected zero rows and the job silently did nothing |
| 3 | 1,899 synthetic hotspots + 188 alerts + 20 facilities from the retired mock provider | Stored with real-looking `source = VIIRS_SNPP_NRT`, indistinguishable from genuine NASA data. Purged; both mock providers deleted |
| 4 | `createAlert` never emitted over Socket.io | An analyst-raised alert appeared for its author but on no other open dashboard until a manual refresh |
| 5 | Overpass returns `HTTP 406` without a `User-Agent` | All facility ingestion failed |
| 6 | OSM importer discarded unnamed elements | Dropped **70 of 82** real industrial zones — exactly the geometry the distance-to-facility feature needs |
| 7 | National-scale classifier thresholds | Put **71%** of real Bhopal detections in `UNKNOWN`. Retuned against the observed distribution; now ~0% |
| 8 | `POST /api/jobs/trigger-firms` was **unauthenticated** and returned stack traces | Any anonymous caller could drive NASA and Overpass requests on this deployment's behalf. Removed in favour of ADMIN-gated `/api/admin/sync/*` |

---

## What TIMS does not claim

- **It does not predict fires.** The risk score is a transparent weighted triage figure with
  its drivers listed on every incident — not a validated probability.
- **It does not confirm causes.** Every class is hedged (`POSSIBLE_INDUSTRIAL_FIRE`).
  Co-location with a mapped factory is suggestive, not probative, and there is no ground
  truth to check against.
- **It does not estimate affected population.** No licensed gridded population layer is
  loaded, so the UI reports *"Population estimate unavailable"* rather than inventing a
  number.
- **It does not route.** Distances are straight-line geodesic and ignore the road network.
- **It does not dispatch.** Acknowledging an alert records an analyst's name for audit; it
  notifies no external agency.

Where a capability is not wired up, the system says so — in the UI, in `/api/health`, and on
the Data Sources page. An honest *"credentials required"* is more useful to an evaluator than
a plausible placeholder.

---

## Deployment

| Component | Target | Notes |
|---|---|---|
| Frontend | Vercel | Root `frontend/`. Set `NEXT_PUBLIC_API_URL` |
| Backend + DB | Render | Root `backend/`. PostGIS must be enabled on the database |
| ML service | Docker | `docker build -f ml-service/Dockerfile -t tims-ml .` — build from the **repository root** |

The ML image runs as a non-root user and its healthcheck reports unhealthy when the model
fails to load, not merely when the port is open — a service that cannot predict should not
receive traffic.

---

<div align="center">

Thermal data courtesy of **NASA FIRMS / LANCE / EOSDIS**
Facility, emergency and boundary geometry **© OpenStreetMap contributors**, ODbL 1.0
Weather fallback **Open-Meteo.com**, CC BY 4.0

</div>
