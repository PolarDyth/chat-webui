# Auth setup (Supabase)

The app is OAuth-first: sign-in buttons for GitHub and Google come first, with
email + password as the backup method. Sessions are cookie-based
(`@supabase/ssr`, PKCE); every API route verifies the session server-side, and
row-level-security policies are enforced on top of that (see
`scripts/verify-rls.mjs`).

## 1. Supabase dashboard: URLs

Project Settings → **Authentication → URL Configuration**:

- **Site URL**: `http://localhost:3000` (add your production URL later)
- **Redirect URLs**: add `http://localhost:3000/**` (and the production URL
  pattern later)

## 2. OAuth providers

Each provider needs a callback of the form
`https://<project-ref>.supabase.co/auth/v1/callback`.

**GitHub**

1. GitHub → Settings → Developer settings → OAuth Apps → *New OAuth App*.
2. Homepage URL: your app URL (e.g. `http://localhost:3000`); Authorization
   callback URL: the callback above.
3. Copy the Client ID, generate a Client Secret.
4. Supabase → Authentication → Sign In / Up → GitHub: enable, paste both.

**Google**

1. Google Cloud Console → APIs & Services → Credentials → *OAuth client ID*
   (Web application).
2. Authorized redirect URI: the callback above.
3. Supabase → Authentication → Sign In / Up → Google: enable, paste the client
   ID and secret.

## 3. Email (backup method)

Email confirmation is **on** by default — password sign-ups receive a
confirmation link, and "Forgot password" sends recovery links. The built-in
Sender works for a personal instance; custom SMTP can be added later.
Passwords can also be attached to an OAuth-only account any time from
**Settings → Account → Set a password**.

## 4. Environment

`.env.local` needs (already present):

```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
```

Both values are public by design. The service-role key is not used anywhere.

## 5. One-time data claim

Existing rows were created under the legacy single-user id. After signing in
for the first time:

```sh
node --env-file=.env.local scripts/claim-local-user.mjs --apply
```

It moves all legacy rows to your account, converts `user_id` columns to uuid,
adds foreign keys to `auth.users`, and swaps in the final RLS policies. Then
sync `src/lib/db/schema.ts` (`user_id` text → uuid). Dry-run it without
`--apply` first.

## 6. Verifying

```sh
node --env-file=.env.local scripts/verify-rls.mjs   # RLS isolation proof
npx vitest run                                       # unit tests
```

Manual pass: sign in with each provider, password sign-up + confirmation link,
forgot-password round-trip, sign out, and (with a second test account) confirm
one account cannot see the other's chats.
