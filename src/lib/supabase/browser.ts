import { createBrowserClient } from '@supabase/ssr';
import { getSupabaseAnonKey, getSupabaseUrl } from './env';

/**
 * Browser Supabase Auth client (PKCE flows, session state, sign-out).
 * createBrowserClient memoizes its singleton, so calling this per component
 * is fine. Returns null when Supabase isn't configured — callers show the
 * not-configured state instead of crashing.
 */
export function getSupabaseBrowserClient() {
  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();
  if (!url || !key) return null;
  return createBrowserClient(url, key);
}
