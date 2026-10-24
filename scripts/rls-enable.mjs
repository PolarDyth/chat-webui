/**
 * Phase 1 migration — grants + RLS policies on chats/messages/settings.
 * Idempotent; safe to re-run. Applied as the `postgres` role (table owner).
 *
 * State before: RLS enabled, zero policies (direct `authenticated`/`anon`
 * access fully denied), no grants. State after: the `authenticated` role can
 * touch rows only when the per-transaction JWT claims match `user_id`, and
 * future tables created by `postgres` are pre-granted.
 *
 * Policies compare `auth.uid()::text` because user_id is TEXT today; the
 * one-time claim migration (scripts/claim-local-user.mjs) converts the
 * columns to uuid and replaces these with cast-free policies.
 *
 * Run: node --env-file=.env.local scripts/rls-enable.mjs
 */
import postgres from 'postgres';

const url =
  process.env.POSTGRES_URL ??
  process.env.DATABASE_URL ??
  process.env.POSTGRES_PRISMA_URL;

if (!url) {
  console.error('No connection string resolved (POSTGRES_URL/DATABASE_URL)');
  process.exit(1);
}

const sql = postgres(url, { prepare: false, max: 1 });
const tables = ['chats', 'messages', 'settings'];

try {
  await sql.begin(async (tx) => {
    // The data layer runs queries as `authenticated` inside a transaction
    // (SET LOCAL ROLE + request.jwt.claims) so RLS genuinely applies on top
    // of the app-level user scoping.
    await tx`GRANT USAGE ON SCHEMA public TO authenticated`;
    await tx`GRANT SELECT, INSERT, UPDATE, DELETE
             ON public.chats, public.messages, public.settings
             TO authenticated`;
    await tx`ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
             GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated`;

    for (const table of tables) {
      await tx`ALTER TABLE public.${sql(table)} ENABLE ROW LEVEL SECURITY`;
      await tx`DROP POLICY IF EXISTS owner_all_access ON public.${sql(table)}`;
      await tx`CREATE POLICY owner_all_access ON public.${sql(table)}
               FOR ALL
               USING (user_id = auth.uid()::text)
               WITH CHECK (user_id = auth.uid()::text)`;
    }

    await tx`CREATE INDEX IF NOT EXISTS chats_user_id_idx ON public.chats (user_id)`;
    await tx`CREATE INDEX IF NOT EXISTS messages_user_id_idx ON public.messages (user_id)`;
  });
  console.log('RLS migration applied.');
} finally {
  // Post-checks (outside the transaction): policy listing + access probes.
  const policies = await sql`
    select tablename, policyname, cmd
    from pg_policies where schemaname = 'public' order by tablename`;
  console.log('policies now:', policies);

  const userA = '00000000-0000-4000-8000-00000000000a';
  await sql.begin(async (tx) => {
    await tx`SET LOCAL ROLE authenticated`;
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userA, role: 'authenticated' })}, true)`;
    const [count] = await tx`select count(*)::int as n from public.chats`;
    console.log(
      `authenticated as user ${userA} sees ${count.n} chats ` +
        `(expected 0 — every row is still owned by 'local-user')`,
    );
  });

  try {
    await sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE anon`;
      const [count] = await tx`select count(*)::int as n from public.chats`;
      console.log(`anon sees ${count.n} chats (expected 0 — no grants/policies for anon)`);
    });
  } catch (err) {
    console.log(`anon blocked outright: ${err.message.split('\n')[0]}`);
  }

  await sql.end();
}
