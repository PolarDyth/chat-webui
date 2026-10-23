import { NextResponse } from 'next/server';

export function dbNotConfigured() {
  return NextResponse.json(
    {
      error: 'db-not-configured',
      message:
        'No Postgres connection configured. Set DATABASE_URL, or paste the Supabase env block (POSTGRES_URL, or POSTGRES_HOST/USER/PASSWORD/DATABASE) into .env.local, then run `npx drizzle-kit push`.',
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

export function serverError(error: unknown) {
  console.error('[api]', error);
  return NextResponse.json(
    { error: 'internal', message: 'Unexpected server error — check the server logs.' },
    { status: 500 },
  );
}
