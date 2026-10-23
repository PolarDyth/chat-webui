/**
 * Single authentication seam.
 *
 * Today: single-user mode — every row is owned by the constant below.
 * Later: replace the body with a Supabase Auth lookup
 * (`@supabase/ssr` createServerClient → supabase.auth.getUser()), upsert the
 * user if needed, and return the real user id. No route, query, or component
 * changes anywhere else in the codebase. See docs/ARCHITECTURE.md.
 */
export const LOCAL_USER_ID = 'local-user';

export async function getCurrentUserId(): Promise<string> {
  return LOCAL_USER_ID;
}
