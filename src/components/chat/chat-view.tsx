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
import { hydrateMessages, totalCostOf } from '@/lib/message-utils';
import type {
  ChatMode,
  ChatSummary,
  ChatUIMessage,
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

  const send = useCallback(
    (text: string) => {
      void sendMessage(
        { text, metadata: { createdAt: new Date().toISOString() } },
        { body: { mode, model } },
      );
    },
    [sendMessage, mode, model],
  );

  // Edit-and-resend. The SDK replaces the question in place and truncates
  // everything after it; the server mirrors that (see api/chat). The original
  // createdAt is kept so the stamp doesn't jump to "now" and back on sync.
  const editMessage = useCallback(
    (message: ChatUIMessage, text: string) => {
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
    [sendMessage, mode, model],
  );

  const regenerateWith = useCallback(
    (options?: { messageId?: string; modelOverride?: string }) => {
      void regenerate({
        ...(options?.messageId ? { messageId: options.messageId } : {}),
        body: { mode, model: options?.modelOverride ?? model },
      });
    },
    [regenerate, mode, model],
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
  } = useChatView(chat, onChatsChanged, adoptTitle);

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
        models={models}
        modelsLoading={modelsLoading}
        totalCost={totalCostOf(messages)}
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
