import { getSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Single authentication seam.
 *
 * Returns the verified Supabase user id (uuid) for the current request, or
 * null when there is no valid session — route handlers respond 401. getUser()
 * (not getSession()) revalidates the access token with the auth server rather
 * than trusting the cookie payload. Every query takes the result as userId.
 */
export async function getCurrentUserId(): Promise<string | null> {
  const supabase = await getSupabaseServerClient();
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}
