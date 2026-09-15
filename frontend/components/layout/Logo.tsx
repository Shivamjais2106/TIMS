import Link from 'next/link';
import { PILOT } from '@/lib/bhopal';
import { cn } from '@/lib/utils';

/**
 * Wordmark.
 *
 * Plain monospace text. Deliberately no flame glyph, no gradient, no icon: the
 * name of a monitoring station is set in the same type as its readouts.
 */
export function Wordmark({
  href = '/',
  showPilot = true,
  className,
}: {
  href?: string | null;
  showPilot?: boolean;
  className?: string;
}) {
  const content = (
    <span className={cn('flex items-baseline gap-2', className)}>
      <span className="tims-data text-[15px] font-semibold tracking-[0.16em] text-fg">TIMS</span>
      {showPilot ? (
        <>
          <span className="text-[13px] font-normal text-fg-subtle" aria-hidden>
            /
          </span>
          <span className="tims-data text-[11px] tracking-[0.12em] text-fg-muted">{PILOT.id}</span>
        </>
      ) : null}
    </span>
  );

  if (!href) return content;

  return (
    <Link href={href} className="tims-nav-item -mx-1 px-1" aria-label="TIMS home">
      {content}
    </Link>
  );
}

/** Expanded lockup for the landing page and report headers. */
export function WordmarkFull({ className }: { className?: string }) {
  return (
    <div className={className}>
      <Wordmark href={null} />
      <p className="mt-1 text-[10px] leading-tight text-fg-subtle">
        Thermal Intelligence &amp; Monitoring System
      </p>
    </div>
  );
}
