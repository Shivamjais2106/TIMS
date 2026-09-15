import { NextResponse, type NextRequest } from 'next/server';

const TOKEN_COOKIE = 'tims_token';

/**
 * Navigation guard.
 *
 * This checks only that a token cookie exists, so signed-out users are not
 * shown an empty console shell. It is NOT an authorisation boundary: every API
 * call is authenticated and authorised server-side, so a forged cookie buys
 * nothing but a dashboard full of 401s.
 *
 * There is deliberately no demo bypass. An earlier version let unauthenticated
 * users into /dashboard when NEXT_PUBLIC_DEMO_MODE was set, which — now that
 * the client no longer carries a bundled sample dataset — would have rendered a
 * console whose every request failed. DEMO_MODE is a backend setting: the
 * server decides what to serve and flags it, and the UI shows a persistent
 * "DEMO DATA" banner.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(TOKEN_COOKIE)?.value;

  if (pathname.startsWith('/dashboard')) {
    if (!token) {
      const loginUrl = new URL('/login', request.url);
      // Preserved so the user lands where they were heading after signing in.
      loginUrl.searchParams.set('next', pathname);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  // Already signed in? Skip the auth screens.
  if ((pathname === '/login' || pathname === '/signup') && token) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/login', '/signup'],
};
