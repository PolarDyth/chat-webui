# Unwall — AI without the paywall

[unwall.it](https://unwall.it) is a multi-model chat workspace built on OpenRouter's **free
tier**: sign in, ask, and the **Smart Auto** router picks a model for your prompt — zero-cost by
default, with automatic fallback when a model is rate-limited. No subscription, no credit card;
bring your own OpenRouter key only if you want premium models.

- **One OpenRouter key, many models**, via the [Vercel AI SDK](https://ai-sdk.dev) (streaming,
  UIMessage protocol) and [AI Elements](https://elements.ai-sdk.dev) chat primitives
  (Conversation, Message/MessageResponse, MessageBranch, Reasoning, PromptInput, Shimmer) on top
  of shadcn/ui.
- **Model selector** in the header:
  - **Auto** — the Smart Auto classifier reads your message and picks the answering model, with
    `openrouter/auto` as the fallback when classification doesn't land.
  - **Free** — routes to `openrouter/free`; zero-cost models only.
  - **Manual** — searchable picker fed live from the OpenRouter models endpoint.
- **Automatic fallback**: if a turn fails with a rate-limit/quota/server error before any output,
  the server retries the next candidate (routed/requested model → your default model → top free
  models) and a toast explains what happened. The answer shows a "fell back from X" badge.
- **Cost visibility is first-class**: before sending you get an exact token estimate (system
  prompt + history + draft) and a projected input cost when the model's pricing is known; after
  each reply the actual usage/cost from OpenRouter is parsed and pinned to the message. The header
  shows the running total for the chat.
- **Answers render full Markdown** with syntax-highlighted code and LaTeX (streamdown + KaTeX),
  plus collapsible reasoning when the model exposes thinking.
- **Regenerate / try another model** keeps every attempt as a **branch** you can flip through.
- **Accounts with Supabase Auth** — OAuth-first (GitHub, Google) with email + password as a
  backup. Sessions are cookie-based PKCE; every API route verifies the session server-side, and
  row-level security scopes every chat row to its owner.
- **Chat history in Postgres (Supabase)** with rename, pin, and delete. Deploys free on Vercel.

## Setup (two minutes)

1. **Supabase** — create a free project at [supabase.com](https://supabase.com), then follow
   [docs/AUTH-SETUP.md](docs/AUTH-SETUP.md) to wire auth (URLs, OAuth providers, RLS).

2. **Environment** — copy `.env.example` to `.env.local` and fill in your values. The only
   required variable is the **pooled** Postgres connection string:

   ```bash
   DATABASE_URL="postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres?sslmode=require"
   ```

   Any of the Supabase "Connect" env shapes also work — first `DATABASE_URL`, then
   `POSTGRES_URL`, then `POSTGRES_PRISMA_URL`, then it builds one from
   `POSTGRES_HOST`/`USER`/`PASSWORD`/`DATABASE`. (`POSTGRES_URL_NON_POOLING` is ignored on
   purpose: direct connections exhaust serverless connection limits.)

   Also set `SETTINGS_ENCRYPTION_KEY` (generate with `openssl rand -base64 32`) — it encrypts
   the OpenRouter API key at rest. Do **not** copy privileged keys you don't need (service
   role, secret key, JWT secret): the app never reads them.

3. **Schema** — push the Drizzle schema:

   ```bash
   npx drizzle-kit push
   ```

4. **Run**:

   ```bash
   npm install
   npm run dev
   ```

5. Open the app → **Settings** → paste your OpenRouter key (it is stored encrypted and never
   sent back to the browser; Verify shows your credit balance) → optionally set a default model
   and a system prompt. Ask something.

## Deploy to Vercel (free)

1. Push the repo to GitHub and import it in Vercel.
2. Add the env vars in *Project → Settings → Environment Variables*: the pooled Postgres URL
   (easiest: the official Supabase–Vercel integration emits exactly these keys) plus
   `SETTINGS_ENCRYPTION_KEY`.
3. Add your production URL to the Supabase redirect allowlist (see
   [docs/AUTH-SETUP.md](docs/AUTH-SETUP.md)).
4. Deploy. No other configuration needed — all API routes run on Vercel's Node runtime and the
   database is your Supabase project.

## Extending

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the seams kept ready for you:

- **Memories** — a `memories` table + recall inside `buildSystemPrompt()`.
- **Web search / PDF analysis** — register a tool in `src/lib/ai/tools/index.ts`; AI Elements
  already renders tool calls, and Supabase Storage can hold uploaded files.

## Notes

- The API key is stored encrypted at rest (AES-256-GCM, key held in `SETTINGS_ENCRYPTION_KEY`)
  in your own database per-user row, used only server-side, and never returned to the browser.
  Prefer `OPENROUTER_API_KEY` in env if you'd rather not store it in Postgres at all.
- Token estimates use `gpt-tokenizer` (o200k) client-side — close enough for planning, not
  billing.
