# Architecture

A single-user Next.js 16 (App Router, `cacheComponents`) + AI SDK v7 workspace. Data lives in
Supabase Postgres via Drizzle; the UI is shadcn/ui with AI Elements chat primitives.

```
src/
  app/
    page.tsx                    → <ChatWorkspace/> (client)
    login/page.tsx              → sign-in (OAuth first, email+password backup)
    reset-password/page.tsx     → recovery-link password form
    auth/callback/route.ts      → PKCE exchange for every auth redirect
    settings/page.tsx           → settings + account (client)
    api/
      chat/route.ts             POST  streaming turn: fallback chain + usage + persistence
      chats/route.ts            GET   chat list (pinned first)
      chats/[id]/route.ts       GET/PATCH/DELETE  messages, rename/pin/mode, delete
      chats/[id]/messages/[messageId]/route.ts
                                PATCH variant switch · POST push variant
      settings/route.ts         GET/PUT  per-user settings (key, default model, system prompt)
      models/route.ts           GET   OpenRouter catalog (upstream cached 1h; public)
      key/route.ts              GET   key validation + credits
  components/
    ui/                         shadcn/ui primitives (owned, copy-paste)
    ai-elements/                AI Elements chat primitives (owned, copy-paste)
    auth/                       login form, sidebar user menu
    chat/                       workspace composition (sidebar, header, canvas, cards, prompt)
  lib/
    auth.ts                     ← THE auth seam (verified Supabase session → uuid | null)
    supabase/                   browser/server/proxy clients + env resolution
    client/api.ts               apiFetch: client fetch wrapper, 401 → /login
    ai/index.ts                 model candidates, provider factory, retry classification
    ai/prompts.ts               buildSystemPrompt() ← memories/context injection point
    ai/tools/index.ts           tool registry passed to streamText
    db/{schema,queries,index}.ts  Drizzle schema + user-scoped, RLS-scoped queries
  proxy.ts                      session refresh + optimistic redirects (not an auth boundary)
  hooks/                        use-chats, use-settings, use-models, use-user
```

## Data flow of a turn

1. `useChat` (AI SDK) POSTs `{ chatId, messages, trigger, messageId, mode, model }` to
   `/api/chat`. The API key + system prompt are read server-side from the user's settings row —
   the key never ships in the client bundle.
2. The route resolves a **candidate chain**. In Auto mode it first runs **Smart Auto**
   (`src/lib/ai/router/`, see below): a heuristic prefilter shortlists annotated models from the
   catalog, a cheap LLM classifies the prompt and picks one — with `openrouter/auto` as the
   no-router fallback. Free/Manual modes use `openrouter/free` / the requested slug as before.
   The chain is then: routed (or `openrouter/auto`) slug → default model (if different) → two
   highest-context free models.

## Smart Auto (own model router)

Auto mode does not delegate routing to `openrouter/auto` anymore — it routes itself, in two
stages under `src/lib/ai/router/`:

1. **`shortlist.ts` — heuristic prefilter (no AI).** Hard constraints prune the 1h-cached
   OpenRouter catalog. Paid path: hand-curated annotations only (`annotations.ts`, tier +
   strengths per slug), text output required, `context_length ≥ prompt tokens × 4` (tokenized
   with gpt-tokenizer), tier-then-price sorted. Free-only path (Settings toggle): every
   zero-cost text model that fits, context-sorted — no annotations, the free pool churns too
   fast. Either way ~18 candidates; an empty shortlist fails closed.
2. **`classify.ts` — LLM classification.** `generateObject` (zod: modelId/confidence/reason)
   over the shortlist table + conversation digest. The classifier is user-configurable:
   Settings → Smart Auto (stored as `settings.router_model`, with a "route only to free
   models" toggle `router_free_only`); resolution order is user setting →
   `OPENROUTER_ROUTER_MODEL` env → built-in default (`nvidia/nemotron-3.5-lightning:free` —
   measured the fastest free model that answers structured calls, Oct 2026). Hash-cached 24h
   per (prompt, digest, router, freeOnly), validated against the shortlist, hard-capped by
   `AbortSignal.timeout` + a race in the route. Any failure returns null → the turn routes
   exactly as before.

Wiring: `/api/chat` starts the classification before the DB ownership work, races it against
3 s before resolving candidates, writes a transient `data-routing` part (client → the
"Routing via …" shimmer), and persists `metadata.routing` on the assistant row. The chosen
slug heads the candidate chain (the paid default model is skipped from fallbacks when
free-only is on), so the existing fallback logic applies unchanged.

Known limitation (Oct 24): the default free classifier is reasoning-heavy and its endpoint
regularly exceeds the 3 s cap — those turns fall back to `openrouter/auto` with no UX
regression, and the account's privacy guardrails exclude most paid flash endpoints
(openrouter.ai/settings/privacy). Picking a faster classifier in Settings (e.g. a paid
flash-lite once credits exist) makes routing land reliably.

The persisted decisions are the point: `(messages.parts, metadata.routing, metadata.model)`
plus implicit feedback (regenerate / edit-resend / manual switch after an auto turn) form the
labeled dataset a future trained classifier would distill from. A standalone tuning surface
lives at `POST /api/route` (`{ prompt, freeOnly? }` → decision + shortlist).

Not built (deliberate): no trained classifier, no vector store. Free and Manual modes are
untouched.
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

### Auth (Supabase — implemented)

`src/lib/auth.ts` is still the only file that knows who the user is:
`getCurrentUserId()` verifies the session server-side (`getUser()`, never
trusting cookie payloads) and returns the user uuid, or null → routes return
401 and `apiFetch` sends the browser to `/login`. Setup steps live in
`docs/AUTH-SETUP.md`.

Defense in depth, in order:

1. **Session** — every API route calls `getCurrentUserId()`; pages get
   optimistic redirects from `src/proxy.ts` (Next 16's renamed middleware).
2. **App-level scoping** — every query takes `userId` and filters on it;
   foreign resources 404 rather than 403 so their existence isn't confirmed.
3. **RLS** — all queries run inside `withUserScope()`
   (`src/lib/db/queries.ts`): a transaction that `SET LOCAL ROLE
   authenticated` + sets `request.jwt.claims`, so the `auth.uid()` policies on
   chats/messages/settings genuinely apply even though the pool connects as
   the table owner (which would otherwise bypass RLS). Both settings are
   transaction-local — nothing leaks into the pooled connection. Prove it any
   time with `scripts/verify-rls.mjs`.

The one-time legacy-data migration is `scripts/claim-local-user.mjs`.

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
- The OpenRouter API key is stored **encrypted at rest** (AES-256-GCM; key in
  `SETTINGS_ENCRYPTION_KEY`, see `src/lib/crypto.ts`). Reads go through
  `getDecryptedApiKey()` (`src/lib/server/api-key.ts`), which also re-encrypts legacy
  plaintext values in place. The plaintext key never leaves the server: the settings API
  returns only `apiKeySet` + a `…last4` hint, and an empty key on save keeps the stored one.
- Rate limits (per-IP, in-memory — `src/lib/rate-limit.ts`): chat 10/min, key checks 30/min,
  model list 60/min. Route bodies are zod-validated at the boundary (`src/lib/validation.ts`).
- Auth traffic goes browser → Supabase directly (OAuth, password sign-in,
  email confirmations), so Supabase's own auth rate limits apply; the app's
  per-IP limits only cover its own API routes. `/api/models` is the only
  public route (catalog cache); everything else 401s without a session.
- Routes return a typed 503 (`db-not-configured`) when the DB is unset; the UI shows a setup
  alert instead of failing cryptically. Error responses stay generic — setup details and
  provider error bodies are logged server-side only.
- Failed turns (every candidate errored) are not billed and leave only the persisted user
  message; the client surfaces the error as a toast.
- `/api/models` runs at request time with a 1h upstream fetch cache so a build-time OpenRouter
  outage can't freeze a stale 502.
