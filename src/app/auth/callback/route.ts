import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

/**
 * PKCE exchange for every Supabase auth redirect: OAuth returns, email
 * confirmations, and password-recovery links all land here with ?code=.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  // Only same-site relative paths — never bounce off-origin.
  const requestedNext = searchParams.get('next') ?? '/';
  const next =
    requestedNext.startsWith('/') && !requestedNext.startsWith('//') ? requestedNext : '/';

  if (code) {
    const supabase = await getSupabaseServerClient();
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
