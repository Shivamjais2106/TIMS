import { NextResponse, type NextRequest } from 'next/server';

const TOKEN_COOKIE = 'tims_token';
const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

/**
 * Route guard.
 *
 * This is a *navigation* guard, not an authorisation boundary: it only checks
 * that a token cookie exists so signed-out users are not shown an empty shell.
 * Every API call is still authenticated and authorised server-side, so a forged
 * cookie buys nothing but a dashboard full of 401s.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(TOKEN_COOKIE)?.value;

  if (pathname.startsWith('/dashboard')) {
    if (!token && !DEMO_MODE) {
      const loginUrl = new URL('/login', request.url);
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
