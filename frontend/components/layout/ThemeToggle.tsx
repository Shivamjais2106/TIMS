'use client';

import { useTheme } from '@/hooks/useTheme';
import { cn } from '@/lib/utils';

/**
 * Dark / light switch.
 *
 * Drawn as a two-position hardware toggle rather than a sun/moon icon pair —
 * the rest of the console labels its controls in mono type, and a physical
 * switch reads correctly beside the channel codes in the navigation rail.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const isLight = theme === 'light';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isLight}
      aria-label={`Switch to ${isLight ? 'dark' : 'light'} theme`}
      title={`${isLight ? 'Light' : 'Dark'} theme — click to switch`}
      onClick={toggle}
      className={cn(
        'tims-nav-item flex items-center gap-1.5 border border-line px-1.5 py-1',
        'text-fg-muted hover:border-line-strong hover:text-fg',
        className,
      )}
    >
      {/* Two-position track. The filled block sits on the active side, so the
          state is readable without relying on colour alone. */}
      <span className="flex h-[11px] w-[20px] items-center border border-current p-[1px]" aria-hidden>
        <span
          className={cn(
            'block h-full w-[7px] bg-current transition-transform duration-150',
            isLight && 'translate-x-[8px]',
          )}
        />
      </span>
      <span className="tims-data text-[10px] tracking-[0.08em]">{isLight ? 'LT' : 'DK'}</span>
    </button>
  );
}

/**
 * Three-way selector for the settings page: dark, light, or follow the OS.
 *
 * The header toggle only flips between the two concrete themes, because a
 * two-position switch cannot express a third state honestly.
 */
export function ThemeSelector({ className }: { className?: string }) {
  const { choice, setChoice, theme } = useTheme();

  const options = [
    { value: 'dark' as const, label: 'Dark' },
    { value: 'light' as const, label: 'Light' },
    { value: 'system' as const, label: 'System' },
  ];

  return (
    <div className={className}>
      <div className="inline-flex border border-line" role="group" aria-label="Theme">
        {options.map((option, index) => {
          const active = choice === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => setChoice(option.value)}
              className={cn(
                'tims-nav-item tims-data px-2.5 py-1 text-[11px]',
                index > 0 && 'border-l border-l-line',
                active ? 'bg-surface-3 text-fg' : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {choice === 'system' ? (
        <p className="mt-1.5 text-[10px] text-fg-subtle">
          Following your operating system, currently{' '}
          <span className="tims-data text-fg-muted">{theme}</span>.
        </p>
      ) : null}
    </div>
  );
}
