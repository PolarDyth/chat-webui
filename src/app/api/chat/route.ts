import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  type InferUIMessageChunk,
  type UIMessage,
} from 'ai';
import type { NextRequest } from 'next/server';
import { getCurrentUserId } from '@/lib/auth';
import { badRequest, dbNotConfigured, serverError, unauthorized } from '@/lib/api-utils';
import { isDbConfigured } from '@/lib/db';
import {
  createChat,
  deleteMessagesAfter,
  getChat,
  getMessage,
  getSettings,
  touchChat,
  updateChat,
  upsertMessage,
} from '@/lib/db/queries';
import { buildSystemPrompt, titleFromUserText } from '@/lib/ai/prompts';
import { getTools } from '@/lib/ai/tools';
import { generateChatTitle } from '@/lib/ai/title';
import { createProvider, isRetryableModelError, resolveModelCandidates } from '@/lib/ai';
import type {
  ChatDataTypes,
  ChatMessageMetadata,
  ChatMode,
  ChatUIMessage,
  MessageVariant,
  TurnUsage,
} from '@/lib/types';

export const maxDuration = 60;

/**
 * Chunks that shape the assistant message but carry no model payload. They are
 * held back until the first payload chunk proves the current model candidate is
 * alive, so a candidate that dies before producing anything never touches the
 * client and the next candidate's start chunks don't collide with forwarded
 * ones.
 */
const STRUCTURAL_CHUNK_TYPES = new Set([
  'start',
  'start-step',
  'reset-step',
  'finish-step',
  'finish',
  'message-metadata',
  'text-start',
  'text-end',
  'reasoning-start',
  'reasoning-end',
]);

type ChatRequestBody = {
  id: string;
  messages: ChatUIMessage[];
  trigger?: 'submit-message' | 'regenerate-message';
  messageId?: string;
  mode?: ChatMode;
  model?: string | null;
};

function usageFrom(raw: unknown): TurnUsage {
  const o = (raw ?? {}) as Record<string, unknown>;
  const numOf = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  const inputTokens =
    numOf(o.inputTokens) || numOf((o.inputTokens as Record<string, unknown>)?.total);
  const outputTokens =
    numOf(o.outputTokens) || numOf((o.outputTokens as Record<string, unknown>)?.total);
  return {
    inputTokens,
    outputTokens,
    totalTokens: numOf(o.totalTokens) || inputTokens + outputTokens,
  };
}

/** The UI stream masks provider errors, so classify from the real thrown error. */
function describeUpstreamError(error: unknown): string | null {
  if (!error) return null;
  if (typeof error === 'object') {
    const e = error as {
      statusCode?: number;
      responseStatusCode?: number;
      message?: string;
      name?: string;
    };
    const status = e.statusCode ?? e.responseStatusCode;
    if (status) return `HTTP ${status}: ${e.message ?? e.name ?? 'model error'}`;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

export async function POST(request: NextRequest) {
  try {
    if (!isDbConfigured) return dbNotConfigured();

    const userId = await getCurrentUserId();
    const body = (await request.json()) as ChatRequestBody;
    const { id: chatId, messages: uiMessages, trigger = 'submit-message' } = body;
    const mode: ChatMode = body.mode ?? 'auto';

    if (!chatId || !Array.isArray(uiMessages) || uiMessages.length === 0) {
      return badRequest('chatId and messages are required');
    }

    const userSettings = await getSettings(userId);
    const apiKey = userSettings?.apiKey?.trim() || process.env.OPENROUTER_API_KEY?.trim();
    if (!apiKey) return badRequest('Add your OpenRouter API key in Settings first.', 'missing-key');

    // Ownership (creates the chat row on first send).
    let chat = await getChat(userId, chatId);
    const lastUser = [...uiMessages].reverse().find((m) => m.role === 'user');
    const firstUserText = lastUser?.parts.find((p) => p.type === 'text')?.text ?? '';
    const isNewChat = !chat || chat.title === 'New chat';
    if (!chat) {
      await createChat(userId, {
        id: chatId,
        title: titleFromUserText(firstUserText),
        mode,
        model: body.model ?? null,
      });
      chat = await getChat(userId, chatId);
      if (!chat) return unauthorized();
    }

    const candidates = await resolveModelCandidates({
      mode,
      model: body.model ?? chat.model,
      defaultModel: userSettings?.defaultModel,
    });

    // Persist the user turn (regenerate re-answers, so no new user message).
    if (trigger === 'submit-message') {
      // A submit carrying a messageId is an edit of an already-sent question:
      // the SDK truncated the client's copy after it, so drop the stale rows
      // here before the upsert below rewrites the question text in place.
      if (lastUser && body.messageId && lastUser.id === body.messageId) {
        const edited = await getMessage(userId, lastUser.id);
        if (edited && edited.chatId === chatId) {
          await deleteMessagesAfter(userId, chatId, lastUser.id);
        }
      }
      if (lastUser) {
        await upsertMessage(userId, {
          id: lastUser.id,
          chatId,
          role: 'user',
          parts: lastUser.parts,
        });
        if (chat.title === 'New chat') {
          await updateChat(userId, chatId, {
            title: titleFromUserText(firstUserText),
            mode,
            model: body.model ?? chat.model,
          });
        } else {
          await touchChat(userId, chatId);
        }
      }
    }

    // AI title rides this same request: started at send time, concurrent with
    // the answer, and pushed through the open stream the moment it resolves.
    let titlePromise: Promise<string | null> | null = null;
    if (isNewChat) {
      const heuristicTitle = titleFromUserText(firstUserText);
      titlePromise = generateChatTitle({
        apiKey,
        defaultModel: userSettings?.defaultModel,
        firstUserText,
      })
        .then(async (aiTitle): Promise<string | null> => {
          if (!aiTitle) return null;
          // A rename during generation wins: only replace the heuristic title.
          const fresh = await getChat(userId, chatId);
          if (!fresh || fresh.title !== heuristicTitle) return null;
          await updateChat(userId, chatId, { title: aiTitle });
          return aiTitle;
        })
        .catch((error) => {
          console.warn('[ai-title] persist failed:', error);
          return null;
        });
    }

    // Regenerating: snapshot the current answer as a variant before replacing it,
    // and drop any rows that came after it (client truncates its own copy too).
    // `||` (not ??) — transports may send messageId as an empty string.
    const regenerateOfId =
      trigger === 'regenerate-message' && body.messageId ? body.messageId : undefined;
    let priorVariants: MessageVariant[] = [];
    if (regenerateOfId) {
      const priorRow = await getMessage(userId, regenerateOfId);
      if (priorRow && priorRow.chatId === chatId) {
        await deleteMessagesAfter(userId, chatId, regenerateOfId);
        priorVariants = [
          ...((priorRow.variants as MessageVariant[] | null) ?? []),
          {
            parts: priorRow.parts as MessageVariant['parts'],
            metadata: (priorRow.metadata as ChatMessageMetadata) ?? undefined,
          },
        ];
      }
    }

    const modelMessages = await convertToModelMessages(uiMessages as UIMessage[]);
    const system = buildSystemPrompt(userSettings?.systemPrompt);
    const provider = createProvider(apiKey);
    const tools = getTools();
    const requestedModel = body.model ?? chat.model ?? candidates[0];
    // One id for the whole turn, decided up front: the client's streamed
    // message, the DB row, and regenerate-reuse all share it.
    const assistantId = regenerateOfId ?? crypto.randomUUID();

    const stream = createUIMessageStream<ChatUIMessage>({
      originalMessages: uiMessages,
      // DB ids are uuid; regenerate reuses the existing assistant message id.
      generateId: () => assistantId,
      onError: (error) => (error instanceof Error ? error.message : 'Stream failed'),
      execute: async ({ writer }) => {
        if (titlePromise) {
          // Push the heuristic title right away so the header shows a real
          // title for the whole first answer, then swap in the AI title the
          // moment it resolves (normally mid-answer).
          writer.write({
            type: 'data-title',
            transient: true,
            data: { title: titleFromUserText(firstUserText) },
          });
          void titlePromise.then((aiTitle) => {
            if (!aiTitle) return;
            try {
              writer.write({ type: 'data-title', transient: true, data: { title: aiTitle } });
            } catch {
              // Stream already closed; the persisted title lands on next refresh.
            }
          });
        }

        let lastErrorText: string | null = null;
        let forwardedError = false;

        for (let i = 0; i < candidates.length; i++) {
          const slug = candidates[i];
          const startedAt = Date.now();

          // streamText masks errors in the UI stream; keep the real one for classification.
          let upstreamError: unknown;
          const result = streamText({
            model: provider.chat(slug, { usage: { include: true } }),
            system,
            messages: modelMessages,
            tools,
          });

          let completedParts: ChatUIMessage['parts'] | null = null;
          const uiStream = result.toUIMessageStream<ChatUIMessage>({
            sendReasoning: true,
            generateMessageId: () => assistantId,
            onError: (error) => {
              upstreamError = error;
              return describeUpstreamError(error) ?? 'Model error';
            },
            onEnd: ({ responseMessage }) => {
              completedParts = responseMessage?.parts ?? null;
            },
          });

          let buffered: InferUIMessageChunk<ChatUIMessage>[] = [];
          let sawContent = false;
          let streamErrorText: string | null = null;

          try {
            for await (const chunk of uiStream) {
              if (chunk.type === 'error') {
                streamErrorText = describeUpstreamError(upstreamError) ?? chunk.errorText;
                if (sawContent) {
                  // Some content already streamed — show the error, no silent retry.
                  writer.write(chunk);
                  forwardedError = true;
                }
                buffered = [];
                break; // nothing shown yet — safe to advance to the fallback candidate
              }
              if (sawContent) {
                writer.write(chunk);
              } else if (STRUCTURAL_CHUNK_TYPES.has(chunk.type)) {
                buffered.push(chunk);
              } else {
                sawContent = true;
                for (const held of buffered) writer.write(held);
                buffered = [];
                // Prior answers for a regenerate, sent before any content so
                // the branch UI exists for the whole turn instead of appearing
                // in a swap when the post-stream sync hydrates metadata.
                if (regenerateOfId && priorVariants.length > 0) {
                  writer.write({ type: 'data-variants', data: { variants: priorVariants } });
                }
                writer.write(chunk);
              }
            }
          } catch (error) {
            streamErrorText =
              describeUpstreamError(upstreamError) ??
              (error instanceof Error ? error.message : String(error));
          }

          if (!streamErrorText) {
            // The candidate finished; an answer with no payload still commits
            // its held structural chunks so the (empty) message is created.
            for (const held of buffered) writer.write(held);
            buffered = [];
            const usage = usageFrom(await result.usage);
            const providerMeta = (await result.providerMetadata) as
              | { openrouter?: { usage?: { cost?: number } } }
              | undefined;
            const metadata: ChatMessageMetadata = {
              mode,
              requestedModel,
              model: slug,
              usage: { ...usage, cost: providerMeta?.openrouter?.usage?.cost },
              durationMs: Date.now() - startedAt,
            };
            const costData: ChatDataTypes['cost'] = {
              model: slug,
              usage: metadata.usage,
              durationMs: metadata.durationMs,
            };
            writer.write({ type: 'data-cost', data: costData });

            // Persist the assistant turn (best effort — the answer is already out).
            try {
              await upsertMessage(userId, {
                id: assistantId,
                chatId,
                role: 'assistant',
                parts: [...(completedParts ?? []), { type: 'data-cost', data: costData }],
                metadata,
                variants: regenerateOfId ? priorVariants : null,
              });
            } catch (persistError) {
              console.error('[chat] persistence failed', persistError);
            }
            await touchChat(userId, chatId);
            return;
          }

          lastErrorText = streamErrorText;
          const canRetry = isRetryableModelError(streamErrorText) && i < candidates.length - 1;
          if (!canRetry) break;

          writer.write({
            type: 'data-fallback',
            transient: true,
            data: { from: slug, to: candidates[i + 1], reason: streamErrorText },
          });
        }

        // Every candidate failed — surface the last real error once.
        if (!forwardedError) {
          writer.write({ type: 'error', errorText: lastErrorText ?? 'All models failed' });
        }
      },
    });

    return createUIMessageStreamResponse({ stream });
  } catch (error) {
    return serverError(error);
  }
}
