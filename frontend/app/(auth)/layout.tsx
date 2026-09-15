import type { ReactNode } from 'react';
import { WordmarkFull } from '@/components/layout/Logo';
import { PILOT } from '@/lib/bhopal';

/**
 * Auth shell.
 *
 * A single centred panel on the survey grid. No stock photography, no
 * inspirational copy — just the station identity and the form.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="tims-grid flex min-h-screen flex-col bg-bg">
      <header className="flex h-12 flex-none items-center border-b border-line bg-bg/90 px-4 backdrop-blur">
        <WordmarkFull />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-[368px]">{children}</div>
      </main>

      <footer className="flex-none border-t border-line px-4 py-3">
        <p className="tims-data text-[10px] text-fg-subtle">
          {PILOT.id} · Smart India Hackathon 2026 · Problem statement SIH26162
        </p>
        <p className="mt-1 text-[10px] text-fg-subtle">
          Thermal data courtesy of NASA FIRMS. Facility and boundary geometry &copy; OpenStreetMap
          contributors.
        </p>
      </footer>
    </div>
  );
}
