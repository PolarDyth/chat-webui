/**
 * One-time data claim migration — run AFTER the first real sign-in.
 *
 * 1. Moves every row still owned by the legacy 'local-user' constant to the
 *    real account (auto-detected when auth.users holds exactly one user, or
 *    pass --user-id=<uuid>).
 * 2. Converts the user_id columns from text to uuid.
 * 3. Replaces the transitional RLS policies (auth.uid()::text cast) with
 *    cast-free uuid policies.
 * 4. Attaches FKs to auth.users(id) ON DELETE CASCADE (per-table best effort;
 *    needs REFERENCES privilege on auth.users — the Supabase-documented
 *    pattern. A failure here doesn't roll back the rest).
 *
 * Dry run by default; add --apply to execute.
 * Run: node --env-file=.env.local scripts/claim-local-user.mjs [--user-id=<uuid>] [--apply]
 *
 * After it succeeds, sync src/lib/db/schema.ts (user_id text -> uuid) and
 * delete the LOCAL_USER_ID constant if any references remain.
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
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const legacy = 'local-user';
const tables = ['chats', 'messages', 'settings'];

let target = args.find((a) => a.startsWith('--user-id='))?.split('=')[1];

try {
  if (!target) {
    let users;
    try {
      users = await sql`select id, email, created_at from auth.users order by created_at asc`;
    } catch (err) {
      console.error('Cannot read auth.users:', err.message);
      console.error('Sign in once, or pass --user-id=<uuid> explicitly.');
      process.exit(1);
    }
    if (users.length === 0) {
      console.error('No users exist yet — sign in once through the app first, then re-run.');
      process.exit(1);
    } else if (users.length === 1) {
      target = users[0].id;
      console.log(`Auto-detected the only account: ${users[0].email ?? target}`);
    } else {
      console.error('Multiple accounts exist — pass --user-id=<uuid> for the owner of:');
      for (const u of users) console.error(`  ${u.id}  ${u.email ?? '(no email)'}`);
      process.exit(1);
    }
  }

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(target)) {
    console.error('--user-id must be a uuid');
    process.exit(1);
  }

  const legacyCounts = {};
  for (const table of tables) {
    const [row] = await sql`select count(*)::int as n from public.${sql(table)} where user_id = ${legacy}`;
    legacyCounts[table] = row.n;
  }
  console.log(`Legacy '${legacy}' rows:`, legacyCounts);
  console.log(`Target account: ${target}`);

  if (!apply) {
    console.log('\nDry run — re-run with --apply to execute.');
    process.exit(0);
  }

  // Phase 1: claim rows, convert types, swap policies — all or nothing.
  await sql.begin(async (tx) => {
    for (const table of tables) {
      await tx`UPDATE public.${sql(table)} SET user_id = ${target} WHERE user_id = ${legacy}`;
      await tx`ALTER TABLE public.${sql(table)} ALTER COLUMN user_id TYPE uuid USING user_id::uuid`;
      await tx`DROP POLICY IF EXISTS owner_all_access ON public.${sql(table)}`;
      await tx`CREATE POLICY owner_all_access ON public.${sql(table)}
               FOR ALL
               USING (user_id = auth.uid())
               WITH CHECK (user_id = auth.uid())`;
    }
  });
  console.log('Claimed rows, converted user_id to uuid, replaced policies.');

  // Phase 2: FKs to auth.users — best effort per table.
  for (const table of tables) {
    try {
      await sql.begin(async (tx) => {
        await tx`ALTER TABLE public.${sql(table)}
                 ADD CONSTRAINT ${sql(`${table}_user_id_fkey`)}
                 FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`;
      });
      console.log(`FK added on ${table}.`);
    } catch (err) {
      console.warn(`FK on ${table} failed (non-fatal): ${err.message.split('\n')[0]}`);
      console.warn('→ add it later from the dashboard SQL editor, or use a delete-trigger.');
    }
  }

  // Post-checks.
  for (const table of tables) {
    const [row] = await sql`select count(*)::int as n from public.${sql(table)} where user_id = ${target}`;
    console.log(`${table}: ${row.n} row(s) now owned by the account`);
  }
  const [columns] = await sql`
    select data_type from information_schema.columns
    where table_schema = 'public' and table_name = 'chats' and column_name = 'user_id'`;
  console.log(`chats.user_id is now: ${columns.data_type}`);
  console.log('\nDone. Reminder: update src/lib/db/schema.ts user_id columns to uuid.');
} finally {
  await sql.end();
}
