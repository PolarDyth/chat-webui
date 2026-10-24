import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSupabaseAnonKey, getSupabaseUrl } from './env';

/**
 * Per-request server client bound to next/headers cookies. Route handlers
 * may write refreshed session cookies; Server Components can't, so write
 * failures there are swallowed per the @supabase/ssr docs. Returns null when
 * Supabase isn't configured.
 */
export async function getSupabaseServerClient() {
  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();
  if (!url || !key) return null;

  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component render — nothing to refresh into.
        }
      },
    },
  });
}
