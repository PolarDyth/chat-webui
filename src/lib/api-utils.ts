import { NextResponse } from 'next/server';

/**
 * Client-facing 503 when storage isn't set up. Generic on purpose: setup
 * details (env var names, tooling) stay in the server log, not API responses.
 */
export function dbNotConfigured() {
  console.error(
    '[api] no database configured — set DATABASE_URL (or any Supabase shape: POSTGRES_URL, POSTGRES_PRISMA_URL, or POSTGRES_HOST/USER/PASSWORD/DATABASE), then run `npx drizzle-kit push`',
  );
  return NextResponse.json(
    {
      error: 'db-not-configured',
      message: 'Service temporarily unavailable — storage is not configured.',
    },
    { status: 503 },
  );
}

export function badRequest(message: string, code = 'bad-request') {
  return NextResponse.json({ error: code, message }, { status: 400 });
}

export function unauthorized() {
  return NextResponse.json({ error: 'unauthorized', message: 'Not your chat.' }, { status: 404 });
}

/**
 * 401 — no valid session at all (distinct from `unauthorized()`, which stays
 * a 404 for an existing-but-foreign resource so ownership isn't confirmed).
 */
export function unauthenticated() {
  return NextResponse.json(
    { error: 'unauthenticated', message: 'Sign in to continue.' },
    { status: 401 },
  );
}

export function serverError(error: unknown) {
  console.error('[api]', error);
  return NextResponse.json(
    { error: 'internal', message: 'Unexpected server error — check the server logs.' },
    { status: 500 },
  );
}
