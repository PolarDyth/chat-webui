/**
 * Supabase client configuration. The NEXT_PUBLIC_ variants are inlined into
 * the browser bundle at build time; the bare ones from the Supabase env block
 * are accepted as fallbacks so either shape works. Both values are public by
 * design (project URL + anon/publishable key).
 */
export function getSupabaseUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
}

export function getSupabaseAnonKey(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.SUPABASE_PUBLISHABLE_KEY
  );
}
