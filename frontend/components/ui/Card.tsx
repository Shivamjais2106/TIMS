import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface CardProps {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className }: CardProps) {
  return (
    <section
      className={cn(
        'rounded-xl border border-line bg-surface shadow-[0_1px_2px_rgb(0_0_0/0.04)]',
        'dark:shadow-[0_1px_0_0_rgb(255_255_255/0.03)_inset]',
        className,
      )}
    >
      {children}
    </section>
  );
}

interface CardHeaderProps {
  title: string;
  description?: string;
  /** Rendered on the right: filters, links, badges. */
  action?: ReactNode;
  className?: string;
}

export function CardHeader({ title, description, action, className }: CardHeaderProps) {
  return (
    <header className={cn('flex items-start justify-between gap-4 border-b border-line px-5 py-4', className)}>
      <div className="min-w-0">
        <h2 className="truncate text-sm font-semibold tracking-tight text-fg">{title}</h2>
        {description ? <p className="mt-0.5 text-xs text-fg-muted">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

export function CardBody({ children, className }: CardProps) {
  return <div className={cn('p-5', className)}>{children}</div>;
}
