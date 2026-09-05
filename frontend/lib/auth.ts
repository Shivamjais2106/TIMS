import Cookies from 'js-cookie';

/**
 * Token storage.
 *
 * The JWT is kept in a cookie rather than localStorage for one specific
 * reason: Next.js middleware runs on the edge and can only see cookies, so this
 * is what lets `/dashboard/*` be guarded before a page is ever rendered.
 *
 * The cookie is intentionally readable by JavaScript (the API client has to
 * attach it as a bearer header). A production deployment that needs XSS-proof
 * sessions should switch the backend to set an httpOnly cookie on a shared
 * parent domain and drop this module — the rest of the app only talks to
 * getToken/setToken/clearToken.
 */

export const TOKEN_COOKIE = 'tims_token';
export const USER_COOKIE = 'tims_user';

const COOKIE_OPTIONS: Cookies.CookieAttributes = {
  sameSite: 'lax',
  secure: typeof window !== 'undefined' && window.location.protocol === 'https:',
  path: '/',
};

export function getToken(): string | null {
  return Cookies.get(TOKEN_COOKIE) ?? null;
}

export function setToken(token: string, days = 7): void {
  Cookies.set(TOKEN_COOKIE, token, { ...COOKIE_OPTIONS, expires: days });
}

export function clearToken(): void {
  Cookies.remove(TOKEN_COOKIE, { path: '/' });
  Cookies.remove(USER_COOKIE, { path: '/' });
}

/**
 * Cached user summary so the shell can render a name and role on first paint
 * instead of flashing a skeleton while /auth/me resolves.
 * Never trusted for authorisation — the API re-checks every request.
 */
export function cacheUserSummary(summary: { name: string; email: string; role: string }): void {
  Cookies.set(USER_COOKIE, JSON.stringify(summary), { ...COOKIE_OPTIONS, expires: 7 });
}

export function readCachedUserSummary(): { name: string; email: string; role: string } | null {
  const raw = Cookies.get(USER_COOKIE);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { name: string; email: string; role: string };
  } catch {
    return null;
  }
}

/** Days a token lives, parsed from the API's "7d" style expiry string. */
export function parseExpiryDays(expiresIn: string, fallback = 7): number {
  const match = /^(\d+)\s*([smhd])$/.exec(expiresIn.trim());
  if (!match) return fallback;
  const amount = Number(match[1]);
  switch (match[2]) {
    case 's':
      return amount / 86_400;
    case 'm':
      return amount / 1440;
    case 'h':
      return amount / 24;
    default:
      return amount;
  }
}
