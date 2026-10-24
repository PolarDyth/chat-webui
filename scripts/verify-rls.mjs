/**
 * End-to-end RLS isolation proof. Inserts a chat row for user A inside a
 * rolled-back transaction, then verifies — as the RLS-bound `authenticated`
 * role — that user B's claims cannot see it and user A's can.
 *
 * Run: node --env-file=.env.local scripts/verify-rls.mjs
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
const userA = '00000000-0000-4000-8000-00000000000a';
const userB = '00000000-0000-4000-8000-00000000000b';
const probeId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

let failures = 0;

const seeAs = async (tx, userId) => {
  await tx`SET LOCAL ROLE authenticated`;
  await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: 'authenticated' })}, true)`;
  const [row] = await tx`select count(*)::int as n from public.chats where id = ${probeId}`;
  return row.n;
};

try {
  // postgres.js commits when sql.begin's callback resolves — throwing forces
  // the rollback, so the probe never leaves a row behind.
  const ROLLBACK = Symbol('rollback');
  try {
    await sql.begin(async (tx) => {
    // Owner-role insert — the app's server code, holding a real session.
    await tx`insert into public.chats (id, user_id, title) values (${probeId}, ${userA}, 'RLS probe')`;

    const seenByA = await seeAs(tx, userA);
    console.log(`user A sees their own probe chat: ${seenByA} (want 1)`);
    if (seenByA !== 1) failures++;

    const seenByB = await seeAs(tx, userB);
    console.log(`user B sees user A's probe chat:   ${seenByB} (want 0)`);
    if (seenByB !== 0) failures++;

    // Same without claims — a forged/empty session must see nothing.
    await tx`SET LOCAL ROLE authenticated`;
    await tx`select set_config('request.jwt.claims', '', true)`;
    const [anon] = await tx`select count(*)::int as n from public.chats where id = ${probeId}`;
    console.log(`no-claims session sees the row:    ${anon.n} (want 0)`);
    if (anon.n !== 0) failures++;

    // Cross-user write: UPDATE silently touches 0 rows (USING filters them
    // out); INSERT of a row owned by A is rejected outright by WITH CHECK.
    await tx`SET LOCAL ROLE authenticated`;
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userB, role: 'authenticated' })}, true)`;
    const updated = await tx`update public.chats set title = 'hijacked' where id = ${probeId}`;
    console.log(`user B update on user A's row affected: ${updated.count} (want 0)`);
    if (updated.count !== 0) failures++;

    let insertBlocked = false;
    try {
      await tx`insert into public.chats (id, user_id, title)
               values (gen_random_uuid(), ${userA}, 'forged row')`;
    } catch {
      insertBlocked = true;
    }
    console.log(`user B insert owned by user A blocked:  ${insertBlocked} (want true)`);
    if (!insertBlocked) failures++;

    throw ROLLBACK;
    });
  } catch (err) {
    if (err !== ROLLBACK) throw err;
  }
  console.log('(transaction rolled back — nothing persisted)');
} finally {
  await sql.end();
}

console.log(failures === 0 ? '\nRLS isolation: PASS' : `\nRLS isolation: FAIL (${failures})`);
process.exit(failures === 0 ? 0 : 1);
