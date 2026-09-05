import { cn } from '@/lib/utils';

/**
 * TIMS mark: a satellite scan sweep over a thermal target.
 * Inline SVG so it inherits `currentColor` and needs no asset request.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-7', className)} fill="none" aria-hidden>
      <circle cx="16" cy="16" r="14" stroke="currentColor" strokeOpacity="0.28" strokeWidth="1.25" />
      <circle cx="16" cy="16" r="9" stroke="currentColor" strokeOpacity="0.45" strokeWidth="1.25" />
      <path d="M16 2v6M16 24v6M2 16h6M24 16h6" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.25" />
      <path
        d="M16 10.5c1.9 2.3 3.6 4 3.6 6.2a3.6 3.6 0 1 1-7.2 0c0-2.2 1.7-3.9 3.6-6.2Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 text-primary">
      <Logo />
      {compact ? null : (
        <div className="leading-none">
          <p className="text-[15px] font-semibold tracking-tight text-fg">TIMS</p>
          <p className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-fg-subtle">Thermal Intelligence</p>
        </div>
      )}
    </div>
  );
}
