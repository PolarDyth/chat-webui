import { defineConfig } from 'drizzle-kit';
import { config } from 'dotenv';
import { resolveDatabaseUrl } from './src/lib/db/connection';

config({ path: '.env.local' });
config();

const url = resolveDatabaseUrl();
if (!url) {
  console.error(
    'No Postgres connection configured. Paste your Supabase env block (POSTGRES_URL, or POSTGRES_HOST/USER/PASSWORD/DATABASE) or DATABASE_URL into .env.local first.',
  );
  process.exit(1);
}

export default defineConfig({
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    // Accepts DATABASE_URL or any Supabase env shape (see src/lib/db/connection.ts).
    url,
  },
});
