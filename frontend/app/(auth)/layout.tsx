import { Database, Satellite, Waypoints } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Wordmark } from '@/components/layout/Logo';

const HIGHLIGHTS = [
  { icon: Satellite, text: 'Near-real-time VIIRS and MODIS thermal anomaly ingestion' },
  { icon: Waypoints, text: 'PostGIS correlation against OpenStreetMap industrial geometry' },
  { icon: Database, text: 'Persistence tracking that separates flares from field fires' },
];

/** Split layout: form on the left, context panel on the right (desktop only). */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <main className="flex flex-col justify-center px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <Link href="/" className="inline-block">
            <Wordmark />
          </Link>
          <div className="mt-10">{children}</div>
        </div>
      </main>

      <aside className="tims-grid-bg relative hidden overflow-hidden border-l border-line bg-surface/40 lg:block">
        <div
          className="pointer-events-none absolute -left-20 top-1/3 size-[420px] rounded-full opacity-[0.14] blur-3xl"
          style={{ background: 'radial-gradient(circle, var(--tims-primary), transparent 65%)' }}
          aria-hidden
        />

        <div className="relative flex h-full flex-col justify-center px-12">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            Smart India Hackathon 2026
          </p>
          <h2 className="mt-4 max-w-md text-3xl font-semibold leading-tight tracking-tight text-fg">
            Detect industrial fires before they become incidents.
          </h2>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-fg-muted">
            TIMS turns raw satellite thermal anomalies into ranked, explainable events tied to the facilities that
            produced them.
          </p>

          <ul className="mt-10 space-y-4">
            {HIGHLIGHTS.map((item) => (
              <li key={item.text} className="flex items-start gap-3">
                <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  <item.icon className="size-3.5" aria-hidden />
                </span>
                <span className="max-w-sm text-xs leading-relaxed text-fg-muted">{item.text}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
