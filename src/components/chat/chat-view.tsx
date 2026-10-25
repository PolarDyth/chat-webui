'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '@/lib/client/api';
import { DefaultChatTransport } from 'ai';
import { useChat } from '@ai-sdk/react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ChatCanvas } from '@/components/chat/chat-canvas';
import { ChatHeader } from '@/components/chat/chat-header';
import { PromptPanel } from '@/components/chat/prompt-panel';
import { chatToMarkdown, downloadTextFile, markdownFilename } from '@/lib/chat-export';
import { estimateTokens } from '@/lib/format';
import { hydrateMessages, streamTextOf, totalCostOf, usageOf } from '@/lib/message-utils';
import type {
  ChatMode,
  ChatSummary,
  ChatUIMessage,
  LiveUsage,
  OpenRouterModel,
  UserSettings,
} from '@/lib/types';

async function fetchChatMessages(chatId: string): Promise<ChatUIMessage[] | null> {
  try {
    const res = await apiFetch(`/api/chats/${chatId}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { messages?: ChatUIMessage[] };
    return Array.isArray(data.messages) ? data.messages : null;
  } catch {
    // transient sync failures are non-fatal
    return null;
  }
}

function useChatView(
  chat: ChatSummary,
  onChatsChanged: () => Promise<void>,
  adoptTitle: (id: string, title: string) => void,
) {
  const [mode, setMode] = useState<ChatMode>(chat.mode);
  const [model, setModel] = useState<string | null>(chat.model);
  // Smart Auto's pick for the in-flight turn, pushed down as a transient
  // data-routing part; null until (and after) each turn so the canvas can show
  // its mode-level placeholder.
  const [routedModel, setRoutedModel] = useState<string | null>(null);
  // False until the first history fetch settles (success or not), so the
  // canvas can show a skeleton instead of flashing the empty state.
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const transport = useMemo(
    () => new DefaultChatTransport<ChatUIMessage>({ api: '/api/chat', fetch: apiFetch }),
    [],
  );

  const { messages, setMessages, sendMessage, regenerate, stop, status } = useChat<ChatUIMessage>({
    id: chat.id,
    transport,
    // DB ids are uuid; the AI SDK's default is a nanoid.
    generateId: () => crypto.randomUUID(),
    onData: (part) => {
      if (part.type === 'data-title') {
        // The server pushed a title update — the heuristic placeholder at
        // stream start, then the AI title mid-answer. Swap it in immediately.
        adoptTitle(chat.id, part.data.title);
      } else if (part.type === 'data-routing') {
        // The router picked a model for this turn — the shimmer names it.
        setRoutedModel(part.data.modelId);
      } else if (part.type === 'data-fallback') {
        toast.warning(`Rate-limited on ${part.data.from}`, {
          description: `Retrying with ${part.data.to}`,
        });
      }
    },
    onError: (error) => {
      toast.error('Request failed', { description: error.message });
    },
  });

  // sync is async: by the time its fetch resolves, the user may already be
  // streaming the next turn. Only fold fetched rows in while the chat is idle.
  const statusRef = useRef(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // Stable identity matters: chatHelpers is a fresh object every render, so
  // callbacks must close over the destructured instance methods instead.
  const sync = useCallback(async () => {
    const fetched = await fetchChatMessages(chat.id);
    if (fetched && statusRef.current === 'ready') {
      setMessages((prev) => hydrateMessages(prev, fetched));
    }
  }, [chat.id, setMessages]);

  // On turn completion: refresh the sidebar (title/updated chat) and re-sync
  // messages so variant/metadata hydrated from the DB replaces the live stream.
  // (onChatsChanged is a stable callback from useChats.)
  const prevStatusRef = useRef(status);
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;
    if (prev === status) return;
    if (status === 'ready') {
      void onChatsChanged();
      void sync();
    } else if (status === 'error') {
      void onChatsChanged();
    }
  }, [status, sync, onChatsChanged]);

  // Load persisted history once per chat.
  useEffect(() => {
    void sync().finally(() => setHistoryLoaded(true));
  }, [sync]);

  // ---- Live turn estimate (issues #12/#14) ----
  // Input tokens are estimated once per send (conversation text so far + the
  // question); output tokens are re-estimated from the streamed text at most
  // every ~256 chars of growth, so per-chunk updates stay cheap. Both are
  // o200k counts and exclude the server-side system prompt — the UI labels
  // them as estimates.
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  });

  const [inputTokensEstimate, setInputTokensEstimate] = useState(0);

  const estimateInputTokens = useCallback((newText: string) => {
    const conversation = messagesRef.current.map((m) => streamTextOf(m)).join('\n');
    setInputTokensEstimate(estimateTokens(conversation + '\n' + newText));
  }, []);

  const lastMessage = messages[messages.length - 1];
  const streamText =
    status === 'streaming' && lastMessage?.role === 'assistant'
      ? streamTextOf(lastMessage)
      : '';
  // The bucket key re-tokenizes only on ~256-char growth; the message id in
  // the key keeps one turn's estimate from bleeding into the next.
  const streamKey = `${lastMessage?.role === 'assistant' ? lastMessage.id : ''}:${Math.floor(streamText.length / 256)}`;
  const outputTokensEstimate = useMemo(
    () => (streamText ? estimateTokens(streamText) : 0),
    // streamText is deliberately read through streamKey — re-tokenizing the
    // full text on every chunk is quadratic on long answers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [streamKey],
  );

  // Null once real usage has landed for the in-flight turn (the data-cost part
  // arrives just before the stream closes), so the exact numbers never
  // double-count with the estimate.
  const estimate: { inputTokens: number; outputTokens: number } | null = useMemo(() => {
    if (status !== 'streaming') return null;
    if (lastMessage?.role !== 'assistant' || usageOf(lastMessage) !== undefined) return null;
    if (inputTokensEstimate === 0 && outputTokensEstimate === 0) return null;
    return { inputTokens: inputTokensEstimate, outputTokens: outputTokensEstimate };
  }, [status, lastMessage, inputTokensEstimate, outputTokensEstimate]);

  const send = useCallback(
    (text: string) => {
      setRoutedModel(null);
      estimateInputTokens(text);
      void sendMessage(
        { text, metadata: { createdAt: new Date().toISOString() } },
        { body: { mode, model } },
      );
    },
    [sendMessage, mode, model, estimateInputTokens],
  );

  // Edit-and-resend. The SDK replaces the question in place and truncates
  // everything after it; the server mirrors that (see api/chat). The original
  // createdAt is kept so the stamp doesn't jump to "now" and back on sync.
  const editMessage = useCallback(
    (message: ChatUIMessage, text: string) => {
      setRoutedModel(null);
      estimateInputTokens(text);
      void sendMessage(
        {
          text,
          messageId: message.id,
          metadata: {
            ...message.metadata,
            createdAt: message.metadata?.createdAt ?? new Date().toISOString(),
          },
        },
        { body: { mode, model } },
      );
    },
    [sendMessage, mode, model, estimateInputTokens],
  );

  const regenerateWith = useCallback(
    (options?: { messageId?: string; modelOverride?: string }) => {
      setRoutedModel(null);
      estimateInputTokens('');
      void regenerate({
        ...(options?.messageId ? { messageId: options.messageId } : {}),
        body: { mode, model: options?.modelOverride ?? model },
      });
    },
    [regenerate, mode, model, estimateInputTokens],
  );

  const selectVariant = useCallback(
    async (message: ChatUIMessage, variantIndex: number) => {
      const res = await apiFetch(`/api/chats/${chat.id}/messages/${message.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ selectVariantIndex: variantIndex }),
      });
      if (res.ok) {
        await sync();
        toast.success('Switched answer');
      }
    },
    [chat.id, sync],
  );

  const changeMode = useCallback(
    (next: ChatMode) => {
      setMode(next);
      void apiFetch(`/api/chats/${chat.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: next }),
      });
    },
    [chat.id],
  );

  const changeModel = useCallback(
    (next: string) => {
      setModel(next);
      setMode('manual');
      void apiFetch(`/api/chats/${chat.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'manual', model: next }),
      });
    },
    [chat.id],
  );

  return {
    messages,
    status,
    historyLoaded,
    stop,
    sync,
    send,
    editMessage,
    regenerateWith,
    selectVariant,
    changeMode,
    changeModel,
    mode,
    model,
    routedModel,
    estimate,
  };
}

export function ChatView({
  chat,
  settings,
  models,
  modelsLoading,
  onChatsChanged,
  adoptTitle,
  drafts,
}: {
  chat: ChatSummary;
  settings: UserSettings;
  models: OpenRouterModel[];
  modelsLoading: boolean;
  onChatsChanged: () => Promise<void>;
  adoptTitle: (id: string, title: string) => void;
  /** Unsent drafts by chat id, owned by the workspace so they outlive this view. */
  drafts: Map<string, string>;
}) {
  const {
    messages,
    status,
    historyLoaded,
    stop,
    send,
    editMessage,
    regenerateWith,
    selectVariant,
    changeMode,
    changeModel,
    mode,
    model,
    routedModel,
    estimate,
  } = useChatView(chat, onChatsChanged, adoptTitle);

  // Price the live estimate from the OpenRouter catalog. Meta-slugs
  // (openrouter/auto, openrouter/free) aren't in the catalog — cost stays null
  // and the UI shows tokens only until the real numbers land.
  const liveUsage: LiveUsage | null = useMemo(() => {
    if (!estimate) return null;
    const slug = routedModel ?? (mode === 'manual' ? model : null);
    const priceRow = slug ? models.find((m) => m.id === slug) : undefined;
    const cost = priceRow
      ? estimate.inputTokens * Number(priceRow.promptPrice) +
        estimate.outputTokens * Number(priceRow.completionPrice)
      : null;
    return {
      inputTokens: estimate.inputTokens,
      outputTokens: estimate.outputTokens,
      cost: cost !== null && Number.isFinite(cost) ? cost : null,
    };
  }, [estimate, routedModel, mode, model, models]);

  // Stable across renders so memoized ExchangeCards skip re-renders per token.
  const handleSelectVariant = useCallback(
    (message: ChatUIMessage, variantIndex: number) => {
      void selectVariant(message, variantIndex);
    },
    [selectVariant],
  );

  const handleDraftChange = useCallback(
    (text: string) => {
      if (text) drafts.set(chat.id, text);
      else drafts.delete(chat.id);
    },
    [drafts, chat.id],
  );

  const exportChat = useCallback(() => {
    downloadTextFile(markdownFilename(chat.title), chatToMarkdown(chat.title, messages));
    toast.success('Exported as Markdown');
  }, [chat.title, messages]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ChatHeader
        title={chat.title}
        mode={mode}
        model={model}
        routedModel={chat.routedModel}
        models={models}
        modelsLoading={modelsLoading}
        totalCost={totalCostOf(messages) + (liveUsage?.cost ?? 0)}
        totalCostLive={liveUsage?.cost != null}
        onModeChange={changeMode}
        onModelChange={changeModel}
        onExport={exportChat}
        canExport={messages.length > 0}
      />

      {!settings.apiKeySet ? (
        <div className="px-4 pt-3">
          <Alert>
            <AlertTitle>No OpenRouter API key</AlertTitle>
            <AlertDescription>
              Add your key on the Settings page before sending — requests would otherwise fail.
            </AlertDescription>
          </Alert>
        </div>
      ) : null}

      <ChatCanvas
        messages={messages}
        status={status}
        historyLoaded={historyLoaded}
        mode={mode}
        model={model}
        routedModel={routedModel}
        liveUsage={liveUsage}
        models={models}
        modelsLoading={modelsLoading}
        onRegenerate={regenerateWith}
        onSelectVariant={handleSelectVariant}
        onEdit={editMessage}
        onSuggestion={send}
      />

      <PromptPanel
        messages={messages}
        systemPrompt={settings.systemPrompt}
        mode={mode}
        model={model}
        models={models}
        status={status}
        initialDraft={drafts.get(chat.id) ?? ''}
        onDraftChange={handleDraftChange}
        onStop={stop}
        onSend={send}
      />
    </div>
  );
}
