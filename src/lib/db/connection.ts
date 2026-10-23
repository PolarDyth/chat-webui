/**
 * Resolves a Postgres connection string from any of the env shapes Supabase
 * hands out — the dashboard "Connect" snippet, the Vercel integration, or a
 * plain DATABASE_URL:
 *
 *   DATABASE_URL | POSTGRES_URL | POSTGRES_PRISMA_URL
 *   POSTGRES_USER + POSTGRES_HOST + POSTGRES_PASSWORD + POSTGRES_DATABASE (+ POSTGRES_PORT)
 *
 * POSTGRES_URL_NON_POOLING is deliberately ignored: it is the direct (port
 * 5432) connection, which exhausts serverless connections on Vercel. All
 * accepted shapes here resolve to Supabase's pooler.
 */
export function resolveDatabaseUrl(): string | undefined {
  const explicit =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    undefined;
  if (explicit && explicit.trim()) return explicit.trim();

  const user = process.env.POSTGRES_USER;
  const host = process.env.POSTGRES_HOST;
  const password = process.env.POSTGRES_PASSWORD;
  const database = process.env.POSTGRES_DATABASE;
  if (!host || !user || !database) return undefined;

  const port = process.env.POSTGRES_PORT || '6543';
  const auth = password
    ? `${encodeURIComponent(user)}:${encodeURIComponent(password)}@`
    : `${encodeURIComponent(user)}@`;
  return `postgres://${auth}${host}:${port}/${database}`;
}
