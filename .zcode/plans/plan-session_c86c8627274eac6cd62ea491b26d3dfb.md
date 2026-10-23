# Audit findings: why chat messages flicker and "change state"

Four root causes, verified against the code and the installed `ai@7` / `@ai-sdk/react@4` internals:

## 1. `answerStreaming` turns off at the first token — the streaming UI is dead during the actual stream
`chat-canvas.tsx:102`: `answerStreaming={streaming && index === last && !exchange.assistant}`. The assistant message object is created the moment the stream's `start` chunk arrives — before any content — so this flag is only true during the empty network-latency window and **false for the entire content stream**. Downstream effects:
- The UsageBadges spinner unmounts and the card header sits empty until the very end.
- The CardFooter (Copy / Regenerate / ModelPicker) mounts at the *start* of streaming instead of at completion.
- `ReasoningBlock` receives `streaming=false`, so the reasoning panel never auto-opens, never computes a duration, and the trigger reads "Thought for a few seconds" *while the model is still thinking*.

## 2. End-of-turn `sync()` replaces the whole message array with DB rows
`chat-view.tsx:69-79` → `setMessages(fetched)` on every status→ready. Consequences:
- Regenerated answers only get `metadata.variants` from this swap → `showBranch` flips → the just-streamed answer is unmounted from the plain view and remounted inside `MessageBranchContent` (Streamdown re-parses → visible flash), and the reasoning block **vanishes** (branch view renders text parts only).
- **Race**: if the user sends the next message before the fetch resolves, `setMessages(fetched)` clobbers the in-flight stream state — a real "message glitched mid-stream" source.

## 3. Model-fallback chain corrupts the stream and fires spurious error toasts
`route.ts:199-267`: `emitted` becomes true on the `start` chunk itself (always emitted before content), so on an immediate 429 the `error` chunk is forwarded (client toasts "Request failed" for a turn that then succeeds), and the loop streams the next candidate into the same message — a second `start` plus duplicated `step-start` parts, visibly resetting the message.

## 4. Every token re-renders every card
`groupExchanges` rebuilds on each `messages` identity change, `ExchangeCard` is unmemoized, and `onSelectVariant` is an inline arrow — whole-list reconciliation per token, amplified by `use-stick-to-bottom`'s `resize="smooth"` animating scroll on every content growth.

# Fix plan

## Phase 1 — core state fixes (the actual glitch causes)
1. **`chat-canvas.tsx`**: `answerStreaming = streaming && index === exchanges.length - 1` (drop `&& !exchange.assistant`). Restores the spinner badge through the stream, footer mounts once at completion, and reasoning auto-open/auto-close works as designed.
2. **`exchange-card.tsx`**: pass `routing={assistantMessage ? undefined : routingModel}` so the badge reads "answering…" rather than "routing via…" once content is arriving.
3. **`chat-view.tsx`**: make end-of-turn sync non-destructive — add a `statusRef` guard so `setMessages` is skipped if a new turn started while the fetch was in flight, and replace `setMessages(fetched)` with an identity-preserving `hydrateMessages(prev, fetched)` helper (new, in `message-utils.ts`): keep the previous object when a row's parts+metadata are unchanged, swap only rows that were actually enriched, append missing rows.
4. **`route.ts` fallback buffering**: per candidate, buffer `start`/`start-step`/metadata chunks; only begin forwarding when the first content chunk (text/reasoning/tool) arrives; if an error arrives before any content, discard the buffer and advance to the next candidate **without** forwarding the error (kills the spurious toast and the double-`start` pollution). Error-after-content still forwards, as today.

## Phase 2 — eliminate the regenerate branch swap
5. **`route.ts`**: when regenerating, write the prior variants as a `data-variants` part immediately after the winning candidate's `start` (before content), so the client knows the variants from the first token.
6. **`message-utils.ts` / `types.ts`**: add the `data-variants` part type; `variantsOf` reads `metadata.variants ?? data-variants` part.
7. **`exchange-card.tsx`**: when variants exist, render branch mode from the start (selector/footer still gated on streaming), and render `ReasoningBlock` in the current-answer slot inside the branch view so it no longer disappears. Result: no content swap at completion — footer + selector simply appear.

## Phase 3 — render performance
8. Wrap `ExchangeCard` in `React.memo` and stabilize the callbacks passed from `ChatView`/`ChatCanvas` (`useCallback` for `onSelectVariant`), so finished cards skip re-render on every token.

## Phase 4 — verification
- Per workspace instructions, read the relevant guides in `node_modules/next/dist/docs/` before touching route-handler code.
- `npm run build` + lint.
- Manual matrix on the dev server: normal turn; reasoning-model turn (auto-open → auto-close with duration); regenerate (variants visible during stream, single footer appearance, no content flash); rapid double-send (no clobber); stop button; chat switch mid-stream; fallback path if a rate-limit can be simulated.
- Update `docs/ARCHITECTURE.md` step 5 (sync now merges; fallback is buffered).

Phases 1 and 3 are the main flicker fixes; Phase 2 removes the last visible "state change" (regenerated answers reshuffling at completion). If you want a smaller first pass, Phases 1 + 3 alone already address the mid-stream flicker and the end-of-turn churn.