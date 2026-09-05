import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { AuthProvider } from '@/hooks/useAuth';
import { ThemeProvider } from '@/hooks/useTheme';
import './globals.css';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-mono-data',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'TIMS — Thermal Intelligence & Monitoring System',
    template: '%s · TIMS',
  },
  description:
    'AI-assisted detection and classification of industrial fires and persistent thermal sources using NASA FIRMS, OpenStreetMap and satellite data.',
  applicationName: 'TIMS',
  keywords: ['NASA FIRMS', 'thermal anomaly', 'industrial fire', 'gas flare', 'PostGIS', 'remote sensing'],
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f7fb' },
    { media: '(prefers-color-scheme: dark)', color: '#05080f' },
  ],
};

/**
 * Applies the stored theme before first paint.
 *
 * Without this the page would render light and then snap to dark once React
 * hydrates, which looks broken on every reload.
 */
const THEME_BOOTSTRAP = `
(function () {
  try {
    var stored = localStorage.getItem('tims-theme');
    var prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
    var theme = stored || (prefersLight ? 'light' : 'dark');
    if (theme === 'dark') document.documentElement.classList.add('dark');
  } catch (error) {
    document.documentElement.classList.add('dark');
  }
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className="min-h-full antialiased">
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
