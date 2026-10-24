import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseProxyClient } from '@/lib/supabase/proxy-client';

/** Paths that only make sense signed out; signed-in users bounce to the app. */
const AUTH_PATHS = new Set(['/login', '/reset-password']);

/**
 * The PKCE completion route — it *creates* the session, so it must always run
 * and is exempt from both redirect branches below. Gating it on having a
 * session makes OAuth bounce back to /login forever.
 */
const AUTH_CALLBACK = '/auth/callback';

/**
 * Optimistic session handling only — per the Next.js docs the proxy is not an
 * authorization boundary. It refreshes session tokens on navigation and
 * redirects obviously-signed-out page requests to /login. Every API route
 * independently enforces the session via getCurrentUserId().
 */
export async function proxy(request: NextRequest) {
  const client = createSupabaseProxyClient(request);
  if (!client) return NextResponse.next();

  const { pathname } = request.nextUrl;

  if (pathname === AUTH_CALLBACK || pathname.startsWith(`${AUTH_CALLBACK}/`)) {
    return client.getResponse();
  }

  const {
    data: { user },
  } = await client.supabase.auth.getUser();

  const isAuthPath = AUTH_PATHS.has(pathname);

  if (!user && !isAuthPath) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    if (pathname !== '/') url.searchParams.set('next', `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(url);
  }

  if (user && isAuthPath) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return client.getResponse();
}

export const config = {
  matcher: [
    // Everything except API routes (they enforce auth themselves), static
    // assets, image optimization, and metadata files.
    '/((?!api|_next/static|_next/image|_next/data|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
