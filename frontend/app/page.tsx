import type { Metadata } from 'next';
import Link from 'next/link';
import { HeroCanvas } from '@/components/landing/HeroCanvas';
import { WordmarkFull } from '@/components/layout/Logo';
import { BHOPAL_BBOX_PARAM, BHOPAL_BOUNDARY, PILOT, THRESHOLDS } from '@/lib/bhopal';

export const metadata: Metadata = {
  title: 'TIMS — Thermal Intelligence & Monitoring System',
  description:
    'Detect, understand and assess thermal anomalies over Bhopal using NASA FIRMS, OpenStreetMap industrial geometry and PostGIS spatial analysis.',
};

/** The detect → assess → support chain the system actually implements. */
const PIPELINE = [
  {
    code: '01',
    label: 'Detect',
    body: 'NASA FIRMS VIIRS (375 m) and MODIS (1 km) thermal anomalies are pulled on a 30-minute schedule and de-duplicated by acquisition identity.',
  },
  {
    code: '02',
    label: 'Geofence',
    body: `A detection counts as a ${PILOT.label} incident only when PostGIS ST_Within places it inside the real ${BHOPAL_BOUNDARY.vertices}-vertex district polygon — not merely inside the request bounding box.`,
  },
  {
    code: '03',
    label: 'Understand',
    body: 'Distance to the nearest industrial site and a recurrence count over a 1 km radius are computed in the database on the WGS84 spheroid, never approximated in JavaScript.',
  },
  {
    code: '04',
    label: 'Classify',
    body: 'An XGBoost model returns a hedged class and a confidence. When it is unreachable a transparent rule engine takes over, and the record says which path ran.',
  },
  {
    code: '05',
    label: 'Assess',
    body: 'A weighted 0–100 triage score with its drivers listed in full: radiative power, confidence, persistence, industrial proximity, populated proximity.',
  },
  {
    code: '06',
    label: 'Support',
    body: 'Concentric 1/3/5 km exposure counts, nearest hospital and fire station, and a live alert pushed over Socket.io for anything HIGH or above.',
  },
] as const;

/**
 * Real, verifiable facts about the system.
 *
 * Deliberately not detection counts or accuracy figures: those change with
 * every ingest, and a hard-coded number on a marketing page would be stale or
 * invented within a day. These are structural properties instead.
 */
const FACTS = [
  { value: '375 m', label: 'VIIRS pixel resolution' },
  { value: `${BHOPAL_BOUNDARY.vertices}`, label: 'Boundary polygon vertices' },
  { value: '4326', label: 'WGS 84 spatial reference' },
  { value: `${THRESHOLDS.impactZonesKm.join('/')} km`, label: 'Impact zone radii' },
] as const;

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <header className="sticky top-0 z-20 flex h-12 items-center justify-between border-b border-line bg-bg/92 px-4 backdrop-blur">
        <WordmarkFull />
        <nav className="flex items-center gap-2">
          <Link
            href="/login"
            className="tims-nav-item border border-line px-3 py-1.5 text-[12px] text-fg-muted hover:border-line-strong hover:text-fg"
          >
            Sign in
          </Link>
        </nav>
      </header>

      {/* --- Hero ----------------------------------------------------- */}
      <section className="tims-grid relative overflow-hidden border-b border-line">
        <div className="mx-auto grid max-w-6xl items-center gap-6 px-5 py-14 lg:grid-cols-[1.05fr_0.95fr] lg:py-20">
          <div>
            <p className="tims-label">
              {PILOT.id} · {PILOT.state}, {PILOT.country}
            </p>

            <h1 className="mt-4 max-w-xl text-[34px] font-semibold leading-[1.12] tracking-tight text-fg sm:text-[42px]">
              Thermal Intelligence &amp;
              <br />
              Monitoring System
            </h1>

            <p className="mt-5 max-w-xl text-[14px] leading-relaxed text-fg-muted">
              Satellites see every fire over Bhopal, but cannot tell a brick kiln from burning crop
              residue. TIMS fuses NASA FIRMS thermal anomalies with OpenStreetMap industrial geometry
              and PostGIS spatial analysis to detect anomalies, assess their risk, and identify what
              is exposed nearby.
            </p>

            <div className="mt-8">
              <Link
                href="/dashboard"
                className="tims-nav-item inline-flex items-center gap-2 border border-rust bg-rust/12 px-5 py-2.5 text-[13px] font-medium text-rust hover:bg-rust/20"
              >
                Open Dashboard
                <span aria-hidden>→</span>
              </Link>
            </div>

            <dl className="mt-11 grid max-w-xl grid-cols-2 gap-px border border-line bg-line sm:grid-cols-4">
              {FACTS.map((fact) => (
                <div key={fact.label} className="bg-surface px-3 py-2.5">
                  <dt className="tims-data text-[15px] font-medium text-fg">{fact.value}</dt>
                  <dd className="mt-1 text-[10px] leading-tight text-fg-subtle">{fact.label}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* The visual sits in its own column rather than as a full-bleed
              background, so it never competes with the text for contrast. */}
          <div className="relative h-[280px] sm:h-[360px] lg:h-[440px]">
            {/* The only Three.js on the site, behind a client boundary. */}
            <HeroCanvas />
            <p className="tims-data absolute bottom-0 left-0 text-[9px] leading-relaxed text-fg-subtle">
              Pilot envelope {BHOPAL_BBOX_PARAM}
              <br />
              Marker position derived from the configured bounding box
            </p>
          </div>
        </div>
      </section>

      {/* --- Pipeline ------------------------------------------------- */}
      <section className="border-b border-line">
        <div className="mx-auto max-w-6xl px-5 py-12">
          <h2 className="tims-label">Processing chain</h2>
          <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-fg-muted">
            Detect → Understand → Assess Risk → Identify Impact → Support Response. Each stage is
            implemented and observable; where a capability is not wired up, the system says so rather
            than showing a plausible placeholder.
          </p>

          <ol className="mt-8 grid gap-px border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
            {PIPELINE.map((stage) => (
              <li key={stage.code} className="bg-surface p-4">
                <div className="flex items-baseline gap-2">
                  <span className="tims-data text-[10px] text-rust">{stage.code}</span>
                  <h3 className="text-[13px] font-medium text-fg">{stage.label}</h3>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-fg-muted">{stage.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* --- Honesty -------------------------------------------------- */}
      <section className="border-b border-line bg-surface/40">
        <div className="mx-auto max-w-6xl px-5 py-12">
          <h2 className="text-[20px] font-semibold tracking-tight text-fg">
            What this system does not claim
          </h2>
          <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-fg-muted">
            A monitoring instrument is only useful if its limits are as legible as its readings.
          </p>

          <ul className="mt-7 grid gap-px border border-line bg-line sm:grid-cols-2">
            {[
              {
                title: 'It does not predict fires',
                body: 'The risk score is a transparent weighted triage figure whose drivers are listed on every incident. It is not a validated probability.',
              },
              {
                title: 'It does not confirm causes',
                body: 'Every class is hedged — "possible industrial fire". Co-location with a mapped factory is suggestive, not probative, and there is no ground truth to check against.',
              },
              {
                title: 'It does not estimate affected population',
                body: 'No licensed gridded population layer is loaded, so the interface reports "population estimate unavailable" instead of producing a number.',
              },
              {
                title: 'It does not dispatch',
                body: 'Acknowledging an alert records an analyst’s name for audit. It notifies no external agency and is not an official emergency alert.',
              },
            ].map((item) => (
              <li key={item.title} className="bg-surface p-4">
                <h3 className="text-[13px] font-medium text-fg">{item.title}</h3>
                <p className="mt-1.5 text-[11px] leading-relaxed text-fg-muted">{item.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* --- Footer --------------------------------------------------- */}
      <footer className="mx-auto w-full max-w-6xl px-5 py-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <WordmarkFull />
            <p className="mt-2 max-w-md text-[10px] leading-relaxed text-fg-subtle">
              Thermal data courtesy of NASA FIRMS / LANCE / EOSDIS. Facility, emergency and boundary
              geometry &copy; OpenStreetMap contributors, {BHOPAL_BOUNDARY.license}.
            </p>
          </div>
          <p className="tims-data text-[10px] text-fg-subtle">
            Smart India Hackathon 2026 · SIH26162 · Team HexaHack
          </p>
        </div>
      </footer>
    </div>
  );
}
