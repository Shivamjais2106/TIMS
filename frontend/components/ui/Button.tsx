import type { ButtonHTMLAttributes, ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

/**
 * Square, hairline-bordered controls.
 *
 * `primary` uses the rust accent and is reserved for the single most important
 * action on a view — if two primaries appear together, one of them is wrong.
 */
type Variant = 'primary' | 'default' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

const VARIANTS: Record<Variant, string> = {
  primary: 'border-rust bg-rust/12 text-rust hover:bg-rust/20',
  default: 'border-line bg-surface-2 text-fg hover:border-line-strong hover:bg-surface-3',
  ghost: 'border-transparent bg-transparent text-fg-muted hover:bg-surface-2 hover:text-fg',
  danger: 'border-risk-critical bg-risk-critical/10 text-risk-critical hover:bg-risk-critical/20',
};

const SIZES: Record<Size, string> = {
  sm: 'px-2 py-1 text-[11px]',
  md: 'px-3 py-1.5 text-[12px]',
};

function classes(variant: Variant, size: Size, className?: string): string {
  return cn(
    'tims-nav-item inline-flex items-center justify-center gap-1.5 border font-medium',
    'disabled:cursor-not-allowed disabled:opacity-40',
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

export function Button({
  children,
  variant = 'default',
  size = 'md',
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: Variant;
  size?: Size;
}) {
  return (
    <button type="button" className={classes(variant, size, className)} {...rest}>
      {children}
    </button>
  );
}

export function ButtonLink({
  children,
  href,
  variant = 'default',
  size = 'md',
  className,
}: {
  children: ReactNode;
  href: string;
  variant?: Variant;
  size?: Size;
  className?: string;
}) {
  return (
    <Link href={href} className={classes(variant, size, className)}>
      {children}
    </Link>
  );
}

/**
 * Segmented filter control.
 *
 * Replaces a dropdown wherever the option count is small: on a monitoring
 * console every available filter state should be visible at a glance rather
 * than hidden behind a click.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: Array<{ value: T; label: string; count?: number; color?: string }>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={cn('inline-flex border border-line', className)} role="group">
      {options.map((option, index) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            className={cn(
              'tims-nav-item tims-data px-2 py-1 text-[11px]',
              index > 0 && 'border-l border-l-line',
              active ? 'bg-surface-3 text-fg' : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
            )}
            style={active && option.color ? { color: option.color } : undefined}
          >
            {option.label}
            {option.count !== undefined ? (
              <span className="ml-1.5 text-fg-subtle">{option.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** Toggle used for map layer switches. Square, with a filled state block. */
export function LayerToggle({
  label,
  checked,
  onChange,
  color,
  count,
  className,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  color?: string;
  count?: number;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'tims-nav-item flex w-full items-center gap-2 px-2 py-1.5 text-left',
        checked ? 'text-fg' : 'text-fg-subtle',
        'hover:bg-surface-2',
        className,
      )}
    >
      <span
        className="flex size-[10px] flex-none items-center justify-center border"
        style={{
          borderColor: checked ? (color ?? '#d8dcde') : '#2a3137',
          background: checked ? (color ?? '#d8dcde') : 'transparent',
        }}
        aria-hidden
      />
      <span className="flex-1 truncate text-[11px]">{label}</span>
      {count !== undefined ? (
        <span className="tims-data flex-none text-[10px] text-fg-subtle">{count}</span>
      ) : null}
    </button>
  );
}
