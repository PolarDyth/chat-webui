import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { resolveDatabaseUrl } from './connection';
import * as schema from './schema';

const connectionString = resolveDatabaseUrl();

export const isDbConfigured = Boolean(connectionString);

/**
 * Supabase Postgres over the transaction pooler: `prepare: false` is required
 * there, and a small pool keeps serverless function count down.
 */
function createDb() {
  if (!connectionString) {
    throw new Error(
      'No Postgres connection configured. Set DATABASE_URL (or any Supabase shape: POSTGRES_URL, POSTGRES_PRISMA_URL, or POSTGRES_HOST/USER/PASSWORD/DATABASE), then run `npx drizzle-kit push`.',
    );
  }
  const client = postgres(connectionString, { prepare: false, max: 10 });
  return drizzle(client, { schema });
}

type Db = PostgresJsDatabase<typeof schema>;

// Reuse across hot reloads in dev.
const globalForDb = globalThis as unknown as { __chatDb?: Db };

export function getDb(): Db {
  globalForDb.__chatDb ??= createDb();
  return globalForDb.__chatDb;
}

export { schema };
