'use client';

import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const FIELD_CLASS =
  'w-full rounded-lg border border-line bg-surface-2 px-3 text-sm text-fg placeholder:text-fg-subtle ' +
  'transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary ' +
  'disabled:cursor-not-allowed disabled:opacity-60';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  /** Icon rendered inside the field, on the left. */
  icon?: ReactNode;
}

export function Input({ label, hint, error, icon, className, id, ...props }: InputProps) {
  const fieldId = id ?? props.name;

  return (
    <div className="w-full">
      {label ? (
        <label htmlFor={fieldId} className="mb-1.5 block text-xs font-medium text-fg-muted">
          {label}
        </label>
      ) : null}

      <div className="relative">
        {icon ? (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle">{icon}</span>
        ) : null}
        <input
          {...props}
          id={fieldId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error && fieldId ? `${fieldId}-error` : undefined}
          className={cn(FIELD_CLASS, 'h-10', icon ? 'pl-9' : '', error ? 'border-red-500/60' : '', className)}
        />
      </div>

      {error ? (
        <p id={fieldId ? `${fieldId}-error` : undefined} className="mt-1.5 text-xs text-red-500">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-fg-subtle">{hint}</p>
      ) : null}
    </div>
  );
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  children: ReactNode;
}

export function Select({ label, className, children, id, ...props }: SelectProps) {
  const fieldId = id ?? props.name;

  return (
    <div className="w-full">
      {label ? (
        <label htmlFor={fieldId} className="mb-1.5 block text-xs font-medium text-fg-muted">
          {label}
        </label>
      ) : null}
      <select {...props} id={fieldId} className={cn(FIELD_CLASS, 'h-10 cursor-pointer pr-8', className)}>
        {children}
      </select>
    </div>
  );
}
