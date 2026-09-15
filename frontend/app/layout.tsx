import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
import { AuthProvider } from '@/hooks/useAuth';
import { RealtimeProvider } from '@/hooks/useRealtime';
import { THEME_BOOTSTRAP, ThemeProvider } from '@/hooks/useTheme';
import { PILOT } from '@/lib/bhopal';
import './globals.css';

/**
 * IBM Plex Sans for prose, IBM Plex Mono for every number, coordinate,
 * timestamp and identifier. No system sans-serif is used in normal rendering —
 * the generic fallbacks exist only for the moment before the webfont resolves.
 */
const plexSans = IBM_Plex_Sans({
  variable: '--font-plex-sans',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
});

const plexMono = IBM_Plex_Mono({
  variable: '--font-plex-mono',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: `TIMS — Thermal Intelligence & Monitoring System · ${PILOT.label}`,
    template: '%s · TIMS',
  },
  description:
    'Detect, understand and assess thermal anomalies over Bhopal using NASA FIRMS, ' +
    'OpenStreetMap industrial geometry and PostGIS spatial analysis. Decision support, ' +
    'not an official emergency alerting system.',
  applicationName: 'TIMS',
  keywords: [
    'NASA FIRMS',
    'thermal anomaly',
    'Bhopal',
    'industrial fire',
    'PostGIS',
    'disaster management',
    'SIH26162',
  ],
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0a0c0e' },
    { media: '(prefers-color-scheme: light)', color: '#f7f6f4' },
  ],
  colorScheme: 'dark light',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: the bootstrap script below sets data-theme
    // before React hydrates, so the server and client markup differ by design.
    <html
      lang="en"
      data-theme="dark"
      suppressHydrationWarning
      className={`${plexSans.variable} ${plexMono.variable}`}
    >
      <head>
        {/* Runs before first paint so a stored light theme does not flash dark. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className="min-h-full bg-bg text-fg antialiased">
        <ThemeProvider>
          <AuthProvider>
            <RealtimeProvider>{children}</RealtimeProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
