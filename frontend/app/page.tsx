import {
  ArrowRight,
  Brain,
  Database,
  Factory,
  Flame,
  Layers,
  Radar,
  Satellite,
  ShieldCheck,
  Waypoints,
} from 'lucide-react';
import Link from 'next/link';
import { Wordmark } from '@/components/layout/Logo';

const CAPABILITIES = [
  {
    icon: Satellite,
    title: 'NASA FIRMS ingestion',
    body: 'VIIRS and MODIS near-real-time thermal anomalies are pulled on a schedule, de-duplicated by acquisition identity, and normalised into a single detection model.',
  },
  {
    icon: Waypoints,
    title: 'PostGIS correlation',
    body: 'Every detection is matched against OpenStreetMap industrial geometry using indexed geography queries — nearest facility, radius search and point-in-area, computed in the database.',
  },
  {
    icon: Flame,
    title: 'Persistence tracking',
    body: 'Detections are binned to a 1 km grid and counted across days, separating a one-off crop burn from a flare stack that has run continuously for three weeks.',
  },
  {
    icon: Brain,
    title: 'Event classification',
    body: 'Brightness temperature, radiative power, persistence and industrial proximity drive a transparent rule engine today, and a trained model on the same interface tomorrow.',
  },
  {
    icon: ShieldCheck,
    title: 'Role-based access',
    body: 'JWT sessions with bcrypt-hashed credentials and ADMIN / ANALYST / VIEWER separation enforced on every write path.',
  },
  {
    icon: Layers,
    title: 'Operational dashboard',
    body: 'An interactive Leaflet console, a searchable detection register, facility profiles, trend analytics and a triaged alert feed.',
  },
];

const PIPELINE = [
  { label: 'NASA FIRMS', detail: 'VIIRS / MODIS NRT', icon: Satellite },
  { label: 'Node.js API', detail: 'Ingest & classify', icon: Radar },
  { label: 'PostgreSQL + PostGIS', detail: 'Spatial correlation', icon: Database },
  { label: 'AI service', detail: 'Planned', icon: Brain },
  { label: 'Next.js console', detail: 'Operator view', icon: Factory },
];

const STATS = [
  { value: '375 m', label: 'VIIRS pixel resolution' },
  { value: '6', label: 'Event classes' },
  { value: '< 3 h', label: 'FIRMS latency' },
  { value: '4326', label: 'WGS 84 SRID' },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Wordmark />
          <nav className="flex items-center gap-2">
            <Link
              href="/login"
              className="rounded-lg px-3.5 py-2 text-sm font-medium text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-fg transition-[filter] hover:brightness-110"
            >
              Request access
            </Link>
          </nav>
        </div>
      </header>

      {/* --- Hero ----------------------------------------------------------- */}
      <section className="tims-grid-bg relative overflow-hidden border-b border-line">
        <div className="absolute inset-x-0 top-0 h-px tims-scan-line" aria-hidden />
        <div
          className="pointer-events-none absolute -right-40 -top-40 size-[520px] rounded-full opacity-[0.13] blur-3xl"
          style={{ background: 'radial-gradient(circle, var(--tims-primary), transparent 65%)' }}
          aria-hidden
        />

        <div className="mx-auto max-w-6xl px-5 py-20 sm:py-28">
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/80 px-3 py-1 text-[11px] font-medium text-fg-muted">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />
              <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
            </span>
            Smart India Hackathon 2026 · Space Technology
          </span>

          <h1 className="mt-6 max-w-3xl text-4xl font-semibold leading-[1.1] tracking-tight text-fg sm:text-5xl lg:text-6xl">
            Thermal Intelligence &amp;
            <span className="block text-primary">Monitoring System</span>
          </h1>

          <p className="mt-6 max-w-2xl text-base leading-relaxed text-fg-muted sm:text-lg">
            Satellites see every fire on the subcontinent, but they cannot tell a refinery flare from burning
            stubble. TIMS fuses NASA FIRMS thermal anomalies with OpenStreetMap industrial geometry and PostGIS
            spatial analysis to detect, classify and rank industrial fires and persistent thermal sources.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-fg transition-[filter] hover:brightness-110"
            >
              Create an account
              <ArrowRight className="size-4" aria-hidden />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-5 py-2.5 text-sm font-medium text-fg transition-colors hover:bg-surface-3"
            >
              Open the console
            </Link>
          </div>

          <dl className="mt-14 grid max-w-3xl grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
            {STATS.map((stat) => (
              <div key={stat.label} className="bg-surface px-4 py-4">
                <dt className="tims-data text-xl font-semibold text-fg">{stat.value}</dt>
                <dd className="mt-1 text-[11px] leading-tight text-fg-subtle">{stat.label}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* --- Pipeline ------------------------------------------------------- */}
      <section className="border-b border-line bg-surface/40">
        <div className="mx-auto max-w-6xl px-5 py-14">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-fg-subtle">Data pipeline</h2>

          <ol className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {PIPELINE.map((stage, index) => (
              <li
                key={stage.label}
                className="relative rounded-xl border border-line bg-surface p-4"
              >
                <div className="flex items-center gap-2 text-primary">
                  <stage.icon className="size-4" aria-hidden />
                  <span className="tims-data text-[10px] text-fg-subtle">0{index + 1}</span>
                </div>
                <p className="mt-2.5 text-sm font-medium text-fg">{stage.label}</p>
                <p className="mt-0.5 text-[11px] text-fg-subtle">{stage.detail}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* --- Capabilities --------------------------------------------------- */}
      <section className="border-b border-line">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <h2 className="max-w-2xl text-2xl font-semibold tracking-tight text-fg sm:text-3xl">
            Built for operations, not for a screenshot
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-fg-muted">
            Every number on the dashboard traces back to a real query against a spatial database. Where a
            capability is not yet wired up, the system says so rather than showing a plausible-looking placeholder.
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CAPABILITIES.map((capability) => (
              <article
                key={capability.title}
                className="rounded-xl border border-line bg-surface p-5 transition-colors hover:border-line-strong"
              >
                <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
                  <capability.icon className="size-4" aria-hidden />
                </span>
                <h3 className="mt-4 text-sm font-semibold text-fg">{capability.title}</h3>
                <p className="mt-2 text-xs leading-relaxed text-fg-muted">{capability.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* --- Footer --------------------------------------------------------- */}
      <footer className="mx-auto max-w-6xl px-5 py-10">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <Wordmark />
            <p className="mt-2 text-[11px] text-fg-subtle">
              Thermal data courtesy of NASA FIRMS. Facility geometry &copy; OpenStreetMap contributors.
            </p>
          </div>
          <p className="text-[11px] text-fg-subtle">Smart India Hackathon 2026 · Problem statement SIH162</p>
        </div>
      </footer>
    </div>
  );
}
