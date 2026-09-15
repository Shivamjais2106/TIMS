/**
 * Loads every page in a real browser and reports console errors.
 *
 * HTTP 200 from the server only proves the HTML was produced. The failures that
 * actually broke this app — "x.filter is not a function", duplicate React keys
 * — happen during client hydration, which a curl check cannot observe. This
 * drives a real browser, waits for the network to settle, and captures
 * everything the console and the error handlers emit.
 *
 *   node scripts/page-audit.mjs [baseUrl] [apiUrl]
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:3000';
const API = process.argv[3] ?? 'http://localhost:4000/api';

const CREDENTIALS = { email: 'admin@tims.gov.in', password: 'Admin@1234' };

/** Console noise that is expected and not a defect. */
const IGNORE = [
  // React dev-mode double-mount closes the first socket before its handshake
  // completes. The reconnect succeeds; the warning is unavoidable in dev.
  /WebSocket is closed before the connection is established/i,
  // Browser extensions injecting into the page.
  /A listener indicated an asynchronous response/i,
  /favicon/i,
  // OSM tile server occasionally rate-limits a tile in a burst of requests.
  /tile\.openstreetmap\.org/i,
  // Next cancels in-flight RSC prefetches when a page unmounts. ERR_ABORTED on
  // a `_rsc=` request is the cancellation working, not a failure.
  /_rsc=/i,
];

function isIgnorable(text) {
  return IGNORE.some((pattern) => pattern.test(text));
}

async function main() {
  // Chromium download is blocked in this environment, so drive the installed
  // Edge instead — same engine, same results.
  const browser = await chromium.launch({ channel: 'msedge', headless: true });

  const token = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(CREDENTIALS),
  })
    .then((response) => response.json())
    .then((payload) => payload?.data?.token)
    .catch(() => null);

  if (!token) {
    console.error(`FATAL: could not sign in at ${API}. Is the backend running?`);
    await browser.close();
    process.exit(1);
  }

  // A top-risk hotspot id, so the detail route is exercised with real data.
  const hotspotId = await fetch(`${API}/hotspots?pageSize=1&sortBy=riskScore&sortOrder=desc`, {
    headers: { Authorization: `Bearer ${token}` },
  })
    .then((response) => response.json())
    .then((payload) => payload?.data?.[0]?.id ?? null)
    .catch(() => null);

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addCookies([{ name: 'tims_token', value: token, url: BASE }]);

  const routes = [
    '/',
    '/dashboard',
    '/dashboard/map',
    '/dashboard/hotspots',
    ...(hotspotId ? [`/dashboard/hotspots/${hotspotId}`] : []),
    '/dashboard/industries',
    '/dashboard/emergency',
    '/dashboard/analytics',
    '/dashboard/alerts',
    '/dashboard/reports',
    '/dashboard/sources',
    '/dashboard/settings',
  ];

  let failures = 0;

  for (const theme of ['dark', 'light']) {
    console.log(`\n${'='.repeat(74)}`);
    console.log(`THEME: ${theme}`);
    console.log('='.repeat(74));

    for (const route of routes) {
      const page = await context.newPage();
      const problems = [];

      page.on('console', (message) => {
        if (message.type() !== 'error' && message.type() !== 'warning') return;
        const text = message.text();
        if (isIgnorable(text)) return;
        problems.push(`[console.${message.type()}] ${text.slice(0, 300)}`);
      });
      page.on('pageerror', (error) => {
        if (isIgnorable(error.message)) return;
        problems.push(`[pageerror] ${error.message.slice(0, 300)}`);
      });
      page.on('requestfailed', (request) => {
        const url = request.url();
        if (isIgnorable(url)) return;
        problems.push(`[requestfailed] ${request.method()} ${url.slice(0, 120)} — ${request.failure()?.errorText}`);
      });

      // Set the theme before any script runs, so the page renders in it from
      // the start rather than being toggled after mount.
      await page.addInitScript(`try { localStorage.setItem('tims-theme', '${theme}'); } catch (e) {}`);

      let status = 0;
      try {
        const response = await page.goto(`${BASE}${route}`, {
          waitUntil: 'domcontentloaded',
          timeout: 45000,
        });
        status = response?.status() ?? 0;

        // Let data fetches, GSAP timelines and Leaflet settle.
        await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
        await page.waitForTimeout(1200);
      } catch (error) {
        problems.push(`[navigation] ${error.message.slice(0, 200)}`);
      }

      // Did anything actually render? A blank body means a crashed root even
      // when the console stayed quiet.
      const bodyText = await page
        .evaluate(() => document.body?.innerText?.trim().length ?? 0)
        .catch(() => 0);
      // Next.js dev mode renders a <nextjs-portal> on EVERY page for its
      // dev-tools button, so the element's presence means nothing. Look inside
      // its shadow root for actual error copy instead.
      const overlayError = await page
        .evaluate(() => {
          const portal = document.querySelector('nextjs-portal');
          const text = portal?.shadowRoot?.textContent ?? '';
          const markers = [
            'Unhandled Runtime Error',
            'Build Error',
            'Console Error',
            'Runtime Error',
            'Failed to compile',
          ];
          const hit = markers.find((marker) => text.includes(marker));
          return hit ?? null;
        })
        .catch(() => null);

      // Content must still be VISIBLE once animations have settled. The
      // entrance animation used to strand panels at opacity 0 after a
      // strict-mode remount, which rendered as "flashes once then vanishes".
      const hidden = await page
        .evaluate(() => {
          const els = Array.from(document.querySelectorAll('.tims-enter'));
          const invisible = els.filter((el) => {
            const opacity = Number(getComputedStyle(el).opacity);
            return Number.isFinite(opacity) && opacity < 0.9;
          });
          return { total: els.length, invisible: invisible.length };
        })
        .catch(() => ({ total: 0, invisible: 0 }));

      if (hidden.invisible > 0) {
        problems.push(`[hidden] ${hidden.invisible}/${hidden.total} .tims-enter panels below 0.9 opacity`);
      }

      if (bodyText < 80) problems.push(`[blank] body text only ${bodyText} chars`);
      if (overlayError) problems.push(`[overlay] dev overlay reports: ${overlayError}`);

      const ok = problems.length === 0;
      if (!ok) failures += 1;

      console.log(
        `  ${ok ? 'PASS' : 'FAIL'}  ${String(status).padEnd(4)} ${route.padEnd(44)} text=${String(bodyText).padEnd(5)} panels=${hidden.total - hidden.invisible}/${hidden.total}`,
      );
      for (const problem of problems) console.log(`          ${problem}`);

      await page.close();
    }
  }

  await browser.close();

  console.log(`\n${'='.repeat(74)}`);
  console.log(failures === 0 ? 'ALL PAGES CLEAN' : `${failures} page/theme combination(s) with problems`);
  console.log('='.repeat(74));

  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('audit crashed:', error);
  process.exit(1);
});
