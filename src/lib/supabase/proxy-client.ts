import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseAnonKey, getSupabaseUrl } from './env';

/**
 * Supabase client for proxy.ts: reads cookies off the incoming request and
 * writes refreshed session cookies onto the outgoing response. Because a
 * token refresh replaces the response object, callers must return
 * `getResponse()` rather than constructing their own NextResponse.next().
 * Returns null when Supabase isn't configured (proxy then passes through and
 * the UI surfaces the not-configured state itself).
 */
export function createSupabaseProxyClient(request: NextRequest) {
  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();
  if (!url || !key) return null;

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });
  return { supabase, getResponse: () => response };
}
