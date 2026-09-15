# Running TIMS locally

Complete guide for starting the system on your machine. For what TIMS is and how it works,
see [README.md](./README.md).

---

## Prerequisites

| Requirement | Version | Check with |
|---|---|---|
| Node.js | 20+ | `node -v` |
| Python | 3.12+ | `python --version` |
| Docker Desktop | any recent | `docker ps` |
| NASA FIRMS MAP_KEY | — | free at [firms.modaps.eosdis.nasa.gov/api/map_key](https://firms.modaps.eosdis.nasa.gov/api/map_key/) — instant, email only |

> [!IMPORTANT]
> The FIRMS key is **mandatory**. TIMS refuses to start ingestion without one rather than
> substituting synthetic data, so the dashboard will be empty until you set it.

---

## The system has four parts

You need all four running. Two are containers, two are host processes.

| # | Part | Port | How it runs |
|---|---|---|---|
| 1 | PostgreSQL + PostGIS | `5432` | Docker container |
| 2 | ML classification service | `8000` | Docker container (or host Python) |
| 3 | Backend API | `4000` | Host — `npm run dev:backend` |
| 4 | Frontend console | `3000` | Host — `npm run dev:frontend` |

The backend and frontend run on the host because both use hot reload during development.

---

## First-time setup

Run these **once**, in order, from the repository root (`D:\SIH162`).

### 1. Start the containers

```bash
docker compose up -d
```

Wait until both report healthy:

```bash
docker ps
# tims-postgis  Up (healthy)  0.0.0.0:5432->5432/tcp
# tims-ml       Up (healthy)  0.0.0.0:8000->8000/tcp
```

### 2. Install dependencies

```bash
npm run install:all
pip install -r ml/requirements.txt
```

### 3. Configure environment

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

Open `backend/.env` and set two values:

```ini
FIRMS_MAP_KEY="your_key_from_nasa"
JWT_SECRET="any_string_at_least_16_characters_long"
```

Generate a secret if you want a strong one:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 4. Set up the database

```bash
npm run setup
```

This runs three steps: applies Prisma migrations, loads the real Bhopal district polygon
into PostGIS, and seeds the user accounts plus the data-source registry.

Expected output ends with:

```
Bhopal boundary loaded { areaKm2: 2767, vertices: 7217, centreInsideBoundary: true }
Seeded 3 user account(s)
Seeded 9 data source registry entr(ies)
```

### 5. Pull real data

```bash
npm run pipeline
```

Two stages, roughly 3 minutes total:

- **OpenStreetMap** (~15 s) — industrial sites and emergency facilities via Overpass
- **NASA FIRMS** (~2–3 min) — thermal detections

> [!NOTE]
> Outside the February–April burning season, live near-real-time FIRMS returns **zero**
> detections for a 25 km box — this is genuine, not a failure. The ingest automatically
> widens to the FIRMS archive across five documented fire seasons and logs exactly which
> window it used. It never substitutes synthetic data.

Expected summary:

```
window            : archive — FIRMS archive, 5 season(s) 2024-02-01 to 2026-04-27
fetched           : 1359
outside boundary  : 65   (rejected by ST_Within)
created           : 1294
```

### 6. Train the model

```bash
npm run ml:train
```

Runs export → clean/EDA → weak labels → train. Takes about a minute and writes:

- `ml/models/classifier.joblib` — the artefact the ML service loads
- `ml/reports/model_report.md` — metrics, confusion matrices, caveats

---

## Daily startup

Once set up, you only need this:

```bash
# 1. Containers (if not already running)
docker compose up -d

# 2. Backend — leave this terminal open
npm run dev:backend

# 3. Frontend — in a SECOND terminal, leave open
npm run dev:frontend
```

Then open **http://localhost:3000**

### Sign in

| Role | Email | Password | Can do |
|---|---|---|---|
| **ADMIN** | `admin@tims.gov.in` | `Admin@1234` | Everything, incl. manual data sync |
| ANALYST | `analyst@tims.gov.in` | `Analyst@1234` | Acknowledge alerts, generate reports |
| VIEWER | `viewer@tims.gov.in` | `Viewer@1234` | Read-only |

The login page has one-click buttons that fill each account.

---

## Confirm it works

```bash
npm run verify
```

This is the honest check — it reads the database, the live API and the model metadata, and
exits non-zero if anything fails. You should see:

```
18 / 18 checks passed
```

Quick manual checks:

```bash
curl http://localhost:4000/api/health     # backend + capability report
curl http://localhost:8000/health         # ML service + model version
docker ps                                 # both containers healthy
```

---

## What to look at

| Page | URL | Shows |
|---|---|---|
| Landing | `/` | Three.js hero, single CTA |
| Overview | `/dashboard` | Stat cards, live map, trend, alert feed |
| Live map | `/dashboard/map` | Layer toggles, time windows, impact zones |
| Hotspots | `/dashboard/hotspots` | Sortable register of all 1,294 detections |
| **Investigation** | `/dashboard/hotspots/[id]` | **The core demo** — risk breakdown, impact zones, emergency resources |
| Industry | `/dashboard/industries` | 82 OSM industrial sites |
| Emergency | `/dashboard/emergency` | 415 hospitals, fire stations, schools |
| Analytics | `/dashboard/analytics` | Trends, distributions, insights |
| Alerts | `/dashboard/alerts` | Live Socket.io feed + triage |
| Reports | `/dashboard/reports` | Generate and review situation reports |
| Data sources | `/dashboard/sources` | Every source with its **real** status |
| Settings | `/dashboard/settings` | Config, capabilities, admin sync, theme |

### Suggested demo flow

1. Open `/dashboard/hotspots` and sort by **Risk** descending.
2. Click the top row — this opens the investigation page.
3. Point out the **risk breakdown**: each component, its weight, and the plain-English
   reasons that produced the score.
4. Point out the **provenance badge** — `ML 99%` means the model classified it; `RULE`
   would mean the service was down and the rule engine took over.
5. Scroll to **impact analysis** — 1/3/5 km exposure counts, and *"Population estimate
   unavailable"* where a lesser system would invent a number.
6. Note the **nearest fire station** distance, with its coverage caveat.
7. Click **Generate incident report**, then open `/dashboard/reports`.

### Switching theme

The header has a two-position `DK / LT` toggle. Dark is the default — the design's native
register. Light is a second treatment rather than an inversion: warm paper-white substrate
like a printed survey sheet, with both accents darkened so they still clear 4.5:1 contrast,
and the risk ramp keeps its order and meaning. The choice persists in `localStorage` and is
applied before first paint, so there is no flash on reload.

`/dashboard/settings` has the three-way selector — dark, light, or follow the OS.

### Demonstrating live alerts

Open `/dashboard/alerts` in one browser tab, then in a terminal:

```bash
TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@tims.gov.in","password":"Admin@1234"}' \
  | python -c "import json,sys;print(json.load(sys.stdin)['data']['token'])")

curl -X POST http://localhost:4000/api/alerts \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"Demo alert","message":"Live push test.","severity":"CRITICAL"}'
```

The alert appears in the notification bell and the register **without a refresh**.

---

## Enabling the 30-minute scheduler

Off by default so a dev server does not hammer NASA. To enable, set in `backend/.env`:

```ini
ENABLE_CRON_JOBS=true
```

Restart the backend. Four jobs register:

| Job | Schedule |
|---|---|
| FIRMS ingest | every 30 min |
| Persistence recompute | hourly at :15 |
| Weather sample | every 30 min |
| OSM sync | weekly, Sunday 03:00 |

All on `Asia/Kolkata`, with overlap guards.

---

## Troubleshooting

<details>
<summary><b>Dashboard is empty</b></summary>

No data ingested yet. Check in order:

```bash
npm run verify                  # tells you exactly what is missing
docker ps                       # is tims-postgis healthy?
grep FIRMS_MAP_KEY backend/.env # is the key set?
npm run pipeline                # pull the data
```

</details>

<details>
<summary><b>"Cannot reach the TIMS API"</b></summary>

The backend is not running or is on a different port.

```bash
curl http://localhost:4000/api/health
```

If that fails, start it with `npm run dev:backend` and check the terminal for errors.
Confirm `frontend/.env.local` has `NEXT_PUBLIC_API_URL="http://localhost:4000/api"`.

</details>

<details>
<summary><b>Classifications show RULE instead of ML</b></summary>

The ML service is unreachable — this is the designed fallback, not a crash. The rule engine
takes over and every record is stamped so you can tell.

```bash
curl http://localhost:8000/health
docker compose up -d ml-service      # or: npm run ml:serve
```

If it reports `model_loaded: false`, train the model: `npm run ml:train`, then rebuild the
image with `docker compose build ml-service`.

To re-classify existing records once it is back:

```bash
npm --prefix backend run ml:reclassify
```

</details>

<details>
<summary><b>Docker engine returns 500 / containers vanish</b></summary>

Docker Desktop's WSL backend has crashed — usually after a low-memory event. Restarting
Docker Desktop alone is often not enough:

```bash
wsl --shutdown
```

Then reopen Docker Desktop and `docker compose up -d`. Your data is safe: it lives in the
`tims-pgdata` volume, which survives engine restarts.

</details>

<details>
<summary><b>Overpass returns HTTP 406 or 504</b></summary>

406 means no `User-Agent` was sent — check `OSM_USER_AGENT` is set in `backend/.env`.
504 means the public Overpass instance is overloaded; wait a few minutes and retry. Facility
data changes on a timescale of months, so this is never urgent.

</details>

<details>
<summary><b>FIRMS returns "Invalid day range"</b></summary>

`FIRMS_DAY_RANGE` must be **1–5**. The API rejects anything larger. The client clamps it
defensively, but fix the value in `backend/.env`.

</details>

<details>
<summary><b>Port already in use</b></summary>

```bash
# Windows — find and kill whatever holds the port
powershell "Get-NetTCPConnection -LocalPort 4000 -State Listen | Select OwningProcess"
powershell "Stop-Process -Id <PID> -Force"
```

</details>

---

## Useful commands

```bash
# Data
npm run pipeline                            # OSM + FIRMS ingest
npm --prefix backend run firms:ingest       # FIRMS only
npm --prefix backend run firms:ingest -- --archive   # force archive sweep
npm --prefix backend run osm:sync           # OSM only
npm --prefix backend run db:recompute -- --all       # recompute, no API calls

# Quality
npm run verify                              # 18-point end-to-end check
npm run typecheck                           # backend + frontend
npm run build                               # production build of both
npm run sync:config:check                   # config drift check

# Database
npm run db:up / npm run db:down             # start / stop containers
npm --prefix backend run prisma:studio      # browse data in a GUI
docker exec -it tims-postgis psql -U tims -d tims   # SQL shell

# Reset everything and start over
docker compose down -v                      # -v also deletes the data volume
docker compose up -d && npm run setup && npm run pipeline
```

---

## Stopping

```bash
# Ctrl+C in the backend and frontend terminals, then:
docker compose down        # stops containers, keeps data
docker compose down -v     # also deletes the database volume
```
