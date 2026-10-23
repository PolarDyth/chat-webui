# Chatboard — a personal multi-model chat workspace

A single-user chat app where every question and answer lives on its own **card** arranged on a
scrollable board — deliberately not a ChatGPT-style bubble thread. Each answer card carries
badges for the **model that answered**, the **real token cost of that turn** (from OpenRouter's
usage accounting), total tokens, and latency.

- **One OpenRouter key, many models**, via the [Vercel AI SDK](https://ai-sdk.dev) (streaming,
  UIMessage protocol) and [AI Elements](https://elements.ai-sdk.dev) chat primitives
  (Conversation, Message/MessageResponse, MessageBranch, Reasoning, PromptInput, Shimmer) on top
  of shadcn/ui.
- **Three-mode model selector** in the header:
  - **Auto** — routes to `openrouter/auto`; OpenRouter picks the best model per request.
  - **Free** — routes to `openrouter/free`; zero-cost models only.
  - **Manual** — searchable picker fed live from the OpenRouter models endpoint.
- **Automatic fallback**: if a turn fails with a rate-limit/quota/server error before any output,
  the server retries the next candidate (requested model → your default model → top free models)
  and a toast explains what happened. The answer card shows a "fell back from X" badge.
- **Cost visibility is first-class**: before sending you get an exact token estimate (system
  prompt + history + draft) and a projected input cost when the model's pricing is known; after
  each reply the actual usage/cost from OpenRouter is parsed and pinned to the card. The header
  shows the running total for the chat.
- **Answers render full Markdown** with syntax-highlighted code and LaTeX (streamdown + KaTeX),
  plus collapsible reasoning when the model exposes thinking.
- **Regenerate / try another model** keeps every attempt as a **branch** you can flip through.
- **Chat history in Postgres (Supabase)** with rename, pin, and delete. Auth-ready: every row is
  scoped by a `userId` that today resolves to a constant (see `src/lib/auth.ts`).
- Strictly single-user. No auth, no teams, no plugins. Deploys free on Vercel.

## Setup (two minutes)

1. **Supabase** — create a free project at [supabase.com](https://supabase.com).

2. **Environment** — create `.env.local` with the **Supabase env block** exactly as Supabase's
   "Connect" dialog / Vercel integration gives it to you:

   ```bash
   NEXT_PUBLIC_SUPABASE_ANON_KEY="..."
   NEXT_PUBLIC_SUPABASE_URL="..."
   POSTGRES_DATABASE="postgres"
   POSTGRES_HOST="aws-0-<region>.pooler.supabase.com"
   POSTGRES_PASSWORD="..."
   POSTGRES_PRISMA_URL="postgresql://postgres.<ref>:...@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true"
   POSTGRES_URL="postgresql://postgres.<ref>:...@aws-0-<region>.pooler.supabase.com:6543/postgres"
   POSTGRES_URL_NON_POOLING="postgresql://postgres.<ref>:...@db.<ref>.supabase.co:5432/postgres"
   POSTGRES_USER="postgres.<ref>"
   SUPABASE_ANON_KEY="..."
   SUPABASE_JWT_SECRET="..."
   SUPABASE_URL="..."
   # ...any of the remaining SUPABASE_* / NEXT_PUBLIC_* keys are harmless
   ```

   The app picks the pooled connection from whichever keys exist — first `DATABASE_URL`, then
   `POSTGRES_URL`, then `POSTGRES_PRISMA_URL`, then it builds one from
   `POSTGRES_HOST`/`USER`/`PASSWORD`/`DATABASE`. (`POSTGRES_URL_NON_POOLING` is ignored on
   purpose: direct connections exhaust serverless connection limits.) A single plain
   `DATABASE_URL=postgresql://...pooler...:6543/postgres` also works. The `SUPABASE_URL` /
   `*_ANON_KEY` keys aren't used yet — they become live when you enable Supabase Auth
   (see docs/ARCHITECTURE.md).

3. **Schema** — push the Drizzle schema:

   ```bash
   npx drizzle-kit push
   ```

4. **Run**:

   ```bash
   npm install
   npm run dev
   ```

5. Open the app → **Settings** → paste your OpenRouter key (Verify shows your credit balance) →
   optionally set a default model and a system prompt. Ask something.

## Deploy to Vercel (free)

1. Push the repo to GitHub and import it in Vercel.
2. Add the Supabase env block in *Project → Settings → Environment Variables* (easiest: the
   official Supabase–Vercel integration emits exactly these keys), or just `POSTGRES_URL`.
3. Deploy. No other configuration needed — all API routes run on Vercel's Node runtime and the
   database is your Supabase project.

## Extending

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the seams kept ready for you:

- **Auth** — swap one function (`src/lib/auth.ts`) for Supabase Auth; every query is already
  user-scoped.
- **Memories** — a `memories` table + recall inside `buildSystemPrompt()`.
- **Web search / PDF analysis** — register a tool in `src/lib/ai/tools/index.ts`; AI Elements
  already renders tool calls, and Supabase Storage can hold uploaded files.

## Notes

- The API key is stored in your own database (per-user row) and used only server-side. Prefer
  `OPENROUTER_API_KEY` in env if you'd rather not store it in Postgres.
- Token estimates use `gpt-tokenizer` (o200k) client-side — close enough for planning, not
  billing.
