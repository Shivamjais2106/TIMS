import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-surface-3', className)} />;
}

interface LoadingStateProps {
  label?: string;
  className?: string;
  /** Approximate height of the panel being replaced, so layout does not jump. */
  minHeight?: number;
}

export function LoadingState({ label = 'Loading data', className, minHeight = 180 }: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('flex flex-col items-center justify-center gap-3 text-fg-subtle', className)}
      style={{ minHeight }}
    >
      <Loader2 className="size-5 animate-spin text-primary" aria-hidden />
      <p className="text-xs">{label}</p>
    </div>
  );
}

/** Skeleton shaped like a data table, used while the first page loads. */
export function TableSkeleton({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="space-y-2 p-5" role="status" aria-label="Loading table">
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex gap-3">
          {Array.from({ length: columns }).map((__, columnIndex) => (
            <Skeleton
              key={columnIndex}
              className={cn('h-8 flex-1', columnIndex === 0 ? 'max-w-[26%]' : '')}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function StatSkeleton() {
  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-4 h-8 w-20" />
      <Skeleton className="mt-3 h-3 w-32" />
    </div>
  );
}
