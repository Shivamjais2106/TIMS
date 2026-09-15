'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

/**
 * Theme state.
 *
 * Two concrete themes plus `system`, which follows the OS preference. The
 * resolved value is written to `data-theme` on <html>, which is what every CSS
 * variable in globals.css keys off.
 */
export type ThemeChoice = 'dark' | 'light' | 'system';
export type ResolvedTheme = 'dark' | 'light';

const STORAGE_KEY = 'tims-theme';

/**
 * Colours needed as JavaScript *values* rather than CSS.
 *
 * Leaflet builds marker HTML as a string and Recharts sets SVG presentation
 * attributes — neither resolves `var(--tims-rust)`. These tables therefore
 * mirror the two blocks in globals.css, and the two must be changed together.
 */
export interface Palette {
  bg: string;
  surface: string;
  surface2: string;
  surface3: string;
  line: string;
  lineStrong: string;
  fg: string;
  fgMuted: string;
  fgSubtle: string;
  rust: string;
  rustDim: string;
  sage: string;
  sageDim: string;
  riskLow: string;
  riskMedium: string;
  riskHigh: string;
  riskCritical: string;
  /** Border colour for map marker glyphs — the substrate, so they read as cut-outs. */
  markerBorder: string;
}

export const PALETTE_DARK: Palette = {
  bg: '#0a0c0e',
  surface: '#101316',
  surface2: '#14181c',
  surface3: '#191e23',
  line: '#1d2226',
  lineStrong: '#2a3137',
  fg: '#d8dcde',
  fgMuted: '#7a8086',
  fgSubtle: '#575d63',
  rust: '#c1502e',
  rustDim: '#8f3b22',
  sage: '#6b9e7a',
  sageDim: '#4e755a',
  riskLow: '#6b9e7a',
  riskMedium: '#9a8c5a',
  riskHigh: '#b57340',
  riskCritical: '#c1502e',
  markerBorder: '#0a0c0e',
};

export const PALETTE_LIGHT: Palette = {
  bg: '#f7f6f4',
  surface: '#fffefc',
  surface2: '#f1efec',
  surface3: '#e8e5e1',
  line: '#ddd9d4',
  lineStrong: '#c3beb7',
  fg: '#1a1d1f',
  fgMuted: '#5c6165',
  fgSubtle: '#8a8f93',
  rust: '#a8401f',
  rustDim: '#7d2f16',
  sage: '#46745a',
  sageDim: '#35573f',
  riskLow: '#46745a',
  riskMedium: '#7a6a33',
  riskHigh: '#9c5720',
  riskCritical: '#a8401f',
  markerBorder: '#fffefc',
};

interface ThemeContextValue {
  /** What the user selected, including `system`. */
  choice: ThemeChoice;
  /** What is actually applied right now. */
  theme: ResolvedTheme;
  palette: Palette;
  setChoice: (choice: ThemeChoice) => void;
  /** Flips between dark and light, resolving `system` first. */
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function systemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function readStoredChoice(): ThemeChoice {
  if (typeof window === 'undefined') return 'dark';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'dark';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Initialised to the default rather than to localStorage, so the server and
  // the client's first render agree. The real value is applied in the effect
  // below; the inline bootstrap script in layout.tsx has already set the
  // attribute on <html>, so there is no visible flash.
  const [choice, setChoiceState] = useState<ThemeChoice>('dark');
  const [resolved, setResolved] = useState<ResolvedTheme>('dark');

  useEffect(() => {
    const stored = readStoredChoice();
    setChoiceState(stored);
    setResolved(stored === 'system' ? systemTheme() : stored);
  }, []);

  // Follow the OS while the choice is `system`.
  useEffect(() => {
    if (choice !== 'system' || typeof window === 'undefined') return;

    const query = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => setResolved(systemTheme());
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [choice]);

  // Apply to the document. This is the single write that re-themes the whole UI.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-theme', resolved);
  }, [resolved]);

  const setChoice = useCallback((next: ThemeChoice) => {
    setChoiceState(next);
    setResolved(next === 'system' ? systemTheme() : next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private browsing can reject writes; the theme still applies for the
      // session, it just will not persist.
    }
  }, []);

  const toggle = useCallback(() => {
    setChoice(resolved === 'dark' ? 'light' : 'dark');
  }, [resolved, setChoice]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      choice,
      theme: resolved,
      palette: resolved === 'light' ? PALETTE_LIGHT : PALETTE_DARK,
      setChoice,
      toggle,
    }),
    [choice, resolved, setChoice, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside a ThemeProvider');
  return context;
}

/** Shorthand for the common case: just the colour values. */
export function usePalette(): Palette {
  return useTheme().palette;
}

/**
 * Inline script that sets `data-theme` before first paint.
 *
 * Without this the page renders in the default theme and then snaps to the
 * stored one once React hydrates, which reads as a broken flash on every load.
 * Kept as a string so it can be injected with dangerouslySetInnerHTML in the
 * document head, ahead of any stylesheet.
 */
export const THEME_BOOTSTRAP = `
(function () {
  try {
    var stored = localStorage.getItem('${STORAGE_KEY}');
    var theme = stored === 'light' || stored === 'dark'
      ? stored
      : stored === 'system'
        ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
        : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
  } catch (error) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
`;
