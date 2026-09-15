import type { InputHTMLAttributes, SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/** Square text input with a mono channel label. */
export function Input({
  label,
  hint,
  error,
  className,
  id,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string; error?: string }) {
  const inputId = id ?? rest.name;

  return (
    <div className="w-full">
      {label ? (
        <label htmlFor={inputId} className="tims-label mb-1 block">
          {label}
        </label>
      ) : null}

      <input
        id={inputId}
        className={cn(
          'w-full border border-line bg-surface-2 px-2.5 py-1.5 text-[13px] text-fg',
          'placeholder:text-fg-subtle',
          'focus:border-line-strong focus:outline-none',
          error && 'border-risk-critical',
          className,
        )}
        aria-invalid={error ? true : undefined}
        aria-describedby={error && inputId ? `${inputId}-error` : undefined}
        {...rest}
      />

      {error ? (
        <p
          id={inputId ? `${inputId}-error` : undefined}
          className="mt-1 text-[11px] text-risk-critical"
        >
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-[10px] leading-snug text-fg-subtle">{hint}</p>
      ) : null}
    </div>
  );
}

export function Select({
  label,
  className,
  id,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  const selectId = id ?? rest.name;

  return (
    <div>
      {label ? (
        <label htmlFor={selectId} className="tims-label mb-1 block">
          {label}
        </label>
      ) : null}
      <select
        id={selectId}
        className={cn(
          'tims-data w-full appearance-none border border-line bg-surface-2 px-2 py-1.5 text-[12px] text-fg',
          'focus:border-line-strong focus:outline-none',
          className,
        )}
        {...rest}
      >
        {children}
      </select>
    </div>
  );
}

/** Search field with a mono prefix marker instead of a magnifier icon. */
export function SearchInput({
  value,
  onChange,
  placeholder = 'Search',
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center border border-line bg-surface-2', className)}>
      <span className="tims-data flex-none px-2 text-[11px] text-fg-subtle" aria-hidden>
        /
      </span>
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full bg-transparent py-1.5 pr-2 text-[12px] text-fg placeholder:text-fg-subtle focus:outline-none"
      />
    </div>
  );
}
