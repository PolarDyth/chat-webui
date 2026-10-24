/**
 * One-time probe before enabling RLS (see feat/auth-rls plan, Phase 1).
 *
 * Verifies, against the live Supabase project:
 *   1. who owns the app tables (owners bypass RLS unless FORCE'd)
 *   2. whether the `postgres` role may `SET LOCAL ROLE authenticated`
 *      inside a transaction and resolve auth.uid() from request.jwt.claims
 *   3. current RLS/policy state of the three app tables
 *
 * Run: node --env-file=.env.local scripts/probe-rls.mjs
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

// Synthetic uuids — never inserted, only used as JWT claims.
const userA = '00000000-0000-4000-8000-00000000000a';

const owners = await sql`
  select tablename, tableowner from pg_tables
  where schemaname = 'public' order by tablename`;
console.log('table owners:', owners);

const rls = await sql`
  select relname, relrowsecurity as rls_enabled, relforcerowsecurity as rls_forced
  from pg_class where relname in ('chats', 'messages', 'settings')`;
console.log('rls state:', rls);

const policies = await sql`
  select tablename, policyname from pg_policies where schemaname = 'public'`;
console.log('existing policies:', policies);

const membership = await sql`
  select
    pg_has_role('postgres', 'authenticated', 'member') as is_member,
    pg_has_role('postgres', 'authenticated', 'usage')  as can_use,
    (select rolsuper from pg_roles where rolname = 'postgres') as postgres_is_superuser`;
console.log('postgres -> authenticated membership:', membership);

try {
  await sql.begin(async (tx) => {
    await tx`SET LOCAL ROLE authenticated`;
    const [who] = await tx`select current_user, session_user`;
    console.log('inside tx after SET LOCAL ROLE:', who);

    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userA, role: 'authenticated' })}, true)`;
    const [uid] = await tx`select auth.uid()`;
    console.log('auth.uid() from claims:', uid.uid, uid.uid === userA ? '(matches userA ✓)' : '(MISMATCH ✗)');
  });
  console.log('PROBE OK — SET LOCAL ROLE authenticated works as postgres');
} catch (err) {
  console.error('PROBE FAILED — SET ROLE path unavailable:', err.message);
  console.error('→ would need the FORCE ROW LEVEL SECURITY fallback instead');
}

await sql.end();
