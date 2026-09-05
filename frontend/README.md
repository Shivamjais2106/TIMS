# TIMS Frontend

Next.js (App Router) operator console for the Thermal Intelligence & Monitoring System.

## Requirements

Node.js 20+, and the TIMS backend running on `http://localhost:4000`.

## Installation

```bash
cd frontend
npm install
cp .env.example .env.local
```

```env
NEXT_PUBLIC_API_URL="http://localhost:4000/api"
NEXT_PUBLIC_DEMO_MODE=false
```

## Running

```bash
npm run dev        # http://localhost:3000
npm run build
npm start
npm run typecheck
npm run lint
```

## Pages

| Route | Purpose |
| --- | --- |
| `/` | Landing page: problem framing, pipeline and capabilities |
| `/login` | Sign in, with one-click fill for the seeded demo accounts |
| `/signup` | Register as VIEWER or ANALYST, with live password-policy feedback |
| `/dashboard` | Stat tiles, live map, recent events, trend, risk mix, alerts, facility summary |
| `/dashboard/map` | Full-screen Leaflet console with layer filters, legend and radius analysis |
| `/dashboard/hotspots` | Searchable, filterable, paginated detection register with a detail panel |
| `/dashboard/industries` | Facility list with a per-site profile and its recent detections |
| `/dashboard/analytics` | Trends, classification, risk mix, regional and facility-class breakdowns |
| `/dashboard/alerts` | Severity summary, read/unread filtering, acknowledge one or all |

## Structure

```
app/           routes; each dashboard page is a thin server component wrapping a *Client.tsx
components/
  ui/          Card, Button, Input, Select, StatCard, Badge, RiskIndicator,
               DataTable, LoadingState, EmptyState
  layout/      Sidebar, Header, ThemeToggle, Logo
  map/         ThermalMap (raw Leaflet), MapView (SSR-safe wrapper),
               HotspotPopup, MapFilters, MapLegend
  charts/      TrendChart, RiskDistributionChart, CategoryChart, RegionChart,
               FacilityChart, ChartShell (shared axis/tooltip tokens)
  dashboard/   RecentEvents, FacilitySummaryPanel
  alerts/      AlertCard
lib/           api client, auth cookie helpers, formatting, constants, demo dataset
services/      one module per API resource
hooks/         useAuth, useTheme, useApi, useHotspots, useDebounce
types/         shared domain types mirroring the API contract
proxy.ts       route guard for /dashboard (Next 16 replacement for middleware.ts)
```

## Design system

Defined entirely in `app/globals.css` as CSS custom properties, exposed to Tailwind v4 through `@theme inline`.

- **Palette** — deep navy substrate, a single cyan instrument accent, and a dedicated thermal ramp
  (blue → amber → orange → red) reserved *exclusively* for risk, so colour always means the same thing.
- **Typography** — Inter for prose, JetBrains Mono for all numeric data (coordinates, temperatures, IDs)
  with tabular figures, which is what gives the console its instrument-panel feel.
- **Dark and light** — class-based, toggled from the header, persisted to `localStorage`, and applied by an
  inline script before first paint so there is no flash of the wrong theme.
- **Accessibility** — risk is never conveyed by colour alone (every chip carries its label, every meter its
  number), interactive controls have accessible names, and `prefers-reduced-motion` is honoured.

`lib/constants.ts` is the single source of truth for event-type, risk and facility-type colours and labels.
Leaflet markers and Recharts series read from it directly, so a legend and a chart can never disagree.

## Map

`components/map/ThermalMap.tsx` drives Leaflet imperatively rather than through `react-leaflet`, which keeps
full control over layer lifecycle and avoids a wrapper that lags React releases. It is loaded through
`MapView.tsx` with `dynamic(..., { ssr: false })` because Leaflet touches `window` at import time.

- Hotspots are canvas `circleMarker`s (fast at ~2000 points): **fill** = event type, **size** = risk score,
  **ring weight** = persistence over 7 days.
- Facilities are `divIcon` badges carrying a single-letter glyph and the facility-type colour.
- Selecting a detection draws three analysis rings — 2 km (the classifier's industrial-proximity threshold),
  half the analysis radius, and the full radius.
- Popups reuse the React `HotspotPopup` component through a single portal container, so the popup and the
  hotspots-page detail panel can never drift apart.

## Data fetching

`hooks/useApi.ts` — about 60 lines — covers loading, error and data, and cancels stale responses. The
dashboard is read-mostly over a handful of endpoints, so Redux or TanStack Query would be more machinery
than the problem justifies.

`lib/api.ts` attaches the bearer token, normalises the `{ success, data, meta }` envelope, and clears the
session on a 401.

## Authentication

The JWT is stored in a JS-readable cookie rather than `localStorage`, for one specific reason: `proxy.ts`
runs on the edge and can only see cookies, which is what lets `/dashboard/*` be guarded before a page is ever
rendered. That guard is a *navigation* convenience — the API authenticates and authorises every request
independently, so a forged cookie buys nothing but a dashboard full of 401s.

For an XSS-hardened deployment, switch the backend to set an httpOnly cookie on a shared parent domain; only
`lib/auth.ts` needs to change.

## Demo mode

Setting `NEXT_PUBLIC_DEMO_MODE=true` **before building** makes the dashboard fall back to the bundled sample
dataset in `lib/mockData.ts` when the API is unreachable, and lets the route guard through without a session.
Useful for presenting the UI with no database. It is off by default and must never be enabled in a real
deployment.

Only a genuine network failure triggers the fallback — a 4xx or 5xx from a live API is rethrown and surfaced,
so a broken backend never hides behind plausible-looking numbers. The header shows an amber
"Demo data — API offline" chip whenever it is active.
