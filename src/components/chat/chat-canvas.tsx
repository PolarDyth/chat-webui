'use client';

import { useMemo } from 'react';
import { Sparkles } from 'lucide-react';
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import { ExchangeCard } from '@/components/chat/exchange-card';
import { Skeleton } from '@/components/ui/skeleton';
import type { ChatUIMessage, ChatMode, OpenRouterModel } from '@/lib/types';

type Exchange = {
  user?: ChatUIMessage;
  assistant?: ChatUIMessage;
};

function groupExchanges(messages: ChatUIMessage[]): Exchange[] {
  const exchanges: Exchange[] = [];
  for (const message of messages) {
    if (message.role === 'user') {
      const last = exchanges.at(-1);
      if (last && !last.user && !last.assistant) {
        last.user = message;
      } else {
        exchanges.push({ user: message });
      }
    } else {
      const last = exchanges.at(-1);
      if (last && !last.assistant) {
        last.assistant = message;
      } else {
        exchanges.push({ assistant: message });
      }
    }
  }
  return exchanges;
}

const SUGGESTIONS = [
  'Explain the halting problem like I have 5 minutes',
  'Compare Postgres row-level security vs app-level authorization',
  'Write a TypeScript debounce with cancel() and leading edge',
];

/** Two ghost turns in the transcript's own shape, shown until history arrives. */
function TranscriptSkeleton() {
  return (
    <div className="flex flex-col gap-8" aria-busy aria-label="Loading conversation">
      {(['w-2/5', 'w-3/5'] as const).map((bubbleWidth) => (
        <div key={bubbleWidth} className="flex flex-col gap-3">
          <Skeleton className={`ml-auto h-9 rounded-2xl ${bubbleWidth}`} />
          <Skeleton className="h-3 w-44" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ChatCanvas({
  messages,
  status,
  historyLoaded,
  mode,
  model,
  routedModel,
  models,
  modelsLoading,
  onRegenerate,
  onSelectVariant,
  onEdit,
  onSuggestion,
}: {
  messages: ChatUIMessage[];
  status: 'submitted' | 'streaming' | 'ready' | 'error';
  historyLoaded: boolean;
  mode: ChatMode;
  model: string | null;
  /** Smart Auto's pick for the in-flight turn, or null before it arrives. */
  routedModel?: string | null;
  models: OpenRouterModel[];
  modelsLoading: boolean;
  onRegenerate: (options?: { messageId?: string; modelOverride?: string }) => void;
  onSelectVariant: (message: ChatUIMessage, variantIndex: number) => void;
  onEdit: (message: ChatUIMessage, text: string) => void;
  onSuggestion: (text: string) => void;
}) {
  const exchanges = useMemo(() => groupExchanges(messages), [messages]);
  const streaming = status === 'submitted' || status === 'streaming';

  return (
    <Conversation className="flex-1">
      <ConversationContent className="mx-auto w-full max-w-3xl gap-8 px-4 py-8">
        {exchanges.length === 0 && !historyLoaded ? (
          <TranscriptSkeleton />
        ) : exchanges.length === 0 ? (
          <div className="flex size-full items-center justify-center py-20">
            <ConversationEmptyState
              icon={<Sparkles className="size-8" />}
              title="Ask anything"
              description={`Routing: ${mode === 'auto' ? 'Auto — the router picks a model per message' : mode === 'free' ? 'Free — zero-cost models only' : `Manual — ${model ?? 'pick a model above'}`}. Every answer carries its model and real token cost.`}
            >
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => onSuggestion(suggestion)}
                    className="bg-card hover:bg-accent text-muted-foreground hover:text-foreground rounded-full border px-3 py-1.5 text-xs transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </ConversationEmptyState>
          </div>
        ) : (
          exchanges.map((exchange, index) => (
            <ExchangeCard
              key={exchange.user?.id ?? exchange.assistant?.id ?? index}
              userMessage={exchange.user}
              assistantMessage={exchange.assistant}
              answerStreaming={streaming && index === exchanges.length - 1}
              editable={!streaming}
              routingModel={
                routedModel ??
                (mode === 'auto'
                  ? 'openrouter/auto'
                  : mode === 'free'
                    ? 'openrouter/free'
                    : (model ?? undefined))
              }
              models={models}
              modelsLoading={modelsLoading}
              onRegenerate={onRegenerate}
              onSelectVariant={onSelectVariant}
              onEdit={onEdit}
            />
          ))
        )}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
}
