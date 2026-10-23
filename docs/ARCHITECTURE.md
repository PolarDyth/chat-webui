# Architecture

A single-user Next.js 16 (App Router, `cacheComponents`) + AI SDK v7 workspace. Data lives in
Supabase Postgres via Drizzle; the UI is shadcn/ui with AI Elements chat primitives.

```
src/
  app/
    page.tsx                    → <ChatWorkspace/> (client)
    settings/page.tsx           → settings form (client)
    api/
      chat/route.ts             POST  streaming turn: fallback chain + usage + persistence
      chats/route.ts            GET   chat list (pinned first)
      chats/[id]/route.ts       GET/PATCH/DELETE  messages, rename/pin/mode, delete
      chats/[id]/messages/[messageId]/route.ts
                                PATCH variant switch · POST push variant
      settings/route.ts         GET/PUT  per-user settings (key, default model, system prompt)
      models/route.ts           GET   OpenRouter catalog (upstream cached 1h)
      key/route.ts              GET   key validation + credits
  components/
    ui/                         shadcn/ui primitives (owned, copy-paste)
    ai-elements/                AI Elements chat primitives (owned, copy-paste)
    chat/                       workspace composition (sidebar, header, canvas, cards, prompt)
  lib/
    auth.ts                     ← THE auth seam (today: constant user id)
    ai/index.ts                 model candidates, provider factory, retry classification
    ai/prompts.ts               buildSystemPrompt() ← memories/context injection point
    ai/tools/index.ts           tool registry passed to streamText
    db/{schema,queries,index}.ts  Drizzle schema + user-scoped queries (server-only)
  hooks/                        use-chats, use-settings, use-models
```

## Data flow of a turn

1. `useChat` (AI SDK) POSTs `{ chatId, messages, trigger, messageId, mode, model }` to
   `/api/chat`. The API key + system prompt are read server-side from the user's settings row —
   the key never ships in the client bundle.
2. The route resolves a **candidate chain**: requested slug → default model (if different) → two
   highest-context free models. `openrouter/auto` / `openrouter/free` are used as-is in Auto and
   Free modes.
3. `createUIMessageStream` + `streamText`. The handler buffers structural chunks (`start`,
   step boundaries) and only forwards them once the first payload chunk (text/reasoning/tool)
   arrives: if the first `error` chunk lands before any payload and the real upstream error is
   retryable (429/402/5xx…), the buffer is discarded, the next candidate starts clean (the
   client never sees a failed candidate), and a transient `data-fallback` part is emitted
   (client → toast). Errors after output has streamed are shown inline, not retried.
4. On success the handler awaits `result.usage` + `providerMetadata.openrouter.usage.cost`,
   writes a `data-cost` part (so the badge appears immediately), and upserts the assistant row —
   including `metadata` (model, usage, cost, duration, fallback) and, on regenerate, the previous
   answer moved into `variants`. On regenerate it also writes a `data-variants` part before any
   content, so the branch UI exists for the whole turn instead of appearing in a swap later.
5. The client's status effect refreshes the chat list and re-syncs messages once the turn ends.
   The sync folds DB rows into the live state via `hydrateMessages` (identity-preserving: only
   rows that actually changed swap in) and skips applying if a new turn already started, so a
   slow fetch can never clobber an in-flight stream.

Regenerate reuses the same assistant message id (via `generateId`), so client and DB stay
consistent; "try another model" is the same flow with a model override.

## Seams for future features

### Auth (Supabase)

`src/lib/auth.ts` is the only file that knows who the user is:

```ts
export async function getCurrentUserId(): Promise<string> {
  return 'local-user';
}
```

Every API route calls it and every query takes the result as `userId`. To enable auth:

1. `npm i @supabase/supabase-js @supabase/ssr`
2. Replace the body: create the browser/server clients, call `supabase.auth.getUser()`, upsert a
   `users` row if you add one, return `user.id`.
3. Add the shadcn login page and a proxy.ts session refresh as per Supabase docs.

No route, query, or component changes. Existing rows keep working under `local-user`; when you
go multi-user, add RLS policies in Supabase as defense-in-depth on top of the app-level checks.

### Memories

Add a `memories` table (`userId`, `content`, `createdAt`). Recall belongs in
`buildSystemPrompt()` (inject a "known facts" block); write via a `saveMemory` **tool** in
`src/lib/ai/tools/index.ts` — the registry is already passed to `streamText`, and AI Elements
`Tool`/`Task` components render the calls.

### Web search

Drop `web-search.ts` (Tavily/Exa/OpenRouter web plugin) exporting a `tool()` into
`src/lib/ai/tools/`, register it, optionally gate it behind a PromptInput toggle (`body:
{ webSearch: true }`). No other changes.

### PDF analysis / attachments

`PromptInput` already supports attachments (`PromptInputActionAddAttachments`, file parts in
`PromptInputMessage`), and message `parts` are stored as JSONB, so file parts persist with no
schema change. Upload binaries to Supabase Storage, extract text server-side (route or tool),
feed as file parts to the model.

## Operational notes

- The Postgres connection string is resolved from any Supabase env shape (`DATABASE_URL` →
  `POSTGRES_URL` → `POSTGRES_PRISMA_URL` → `POSTGRES_HOST/USER/PASSWORD/DATABASE`) — see
  `src/lib/db/connection.ts`. It should be the **pooler** (Supabase's emitted keys point there);
  `POSTGRES_URL_NON_POOLING` is intentionally ignored for serverless connection safety.
  `prepare: false` (set in `src/lib/db/index.ts`) is required on Supabase's transaction pooler.
- `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` from the same env block are
  unused today and are consumed when Supabase Auth is enabled at the `src/lib/auth.ts` seam.
- Routes return a typed 503 (`db-not-configured`) when the DB is unset; the UI shows a setup
  alert instead of failing cryptically.
- Failed turns (every candidate errored) are not billed and leave only the persisted user
  message; the client surfaces the error as a toast.
- `/api/models` runs at request time with a 1h upstream fetch cache so a build-time OpenRouter
  outage can't freeze a stale 502.
