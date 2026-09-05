import type { LucideIcon } from 'lucide-react';
import { Inbox } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  className?: string;
  minHeight?: number;
}

export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
  className,
  minHeight = 180,
}: EmptyStateProps) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center gap-2 px-6 py-10 text-center', className)}
      style={{ minHeight }}
    >
      <span className="grid size-10 place-items-center rounded-full bg-surface-3 text-fg-subtle">
        <Icon className="size-5" aria-hidden />
      </span>
      <p className="text-sm font-medium text-fg">{title}</p>
      {description ? <p className="max-w-sm text-xs text-fg-muted">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({ message, onRetry, className }: ErrorStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 px-6 py-10 text-center', className)}>
      <span className="grid size-10 place-items-center rounded-full bg-red-500/10 text-red-500">!</span>
      <p className="max-w-md text-sm text-fg">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-lg bg-surface-3 px-3 py-1.5 text-xs font-medium text-fg ring-1 ring-inset ring-line hover:bg-surface-2"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}
