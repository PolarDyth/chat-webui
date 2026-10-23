'use client';

import { useMemo, useState } from 'react';
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  type PromptInputMessage,
} from '@/components/ai-elements/prompt-input';
import { estimateTokens, formatCost } from '@/lib/format';
import type { ChatMode, ChatUIMessage, OpenRouterModel } from '@/lib/types';

const PROJECTED_OUTPUT_TOKENS = 512;

/**
 * Pre-send visibility: exact token estimate over (system prompt + history +
 * draft), and an input-cost projection when the active model has known
 * pricing. Auto/Free prices resolve per request, so cost shows as "—".
 */
export function PromptPanel({
  messages,
  systemPrompt,
  mode,
  model,
  models,
  status,
  onStop,
  onSend,
}: {
  messages: ChatUIMessage[];
  systemPrompt: string;
  mode: ChatMode;
  model: string | null;
  models: OpenRouterModel[];
  status: 'submitted' | 'streaming' | 'ready' | 'error';
  onStop: () => void;
  onSend: (text: string) => void;
}) {
  const [draft, setDraft] = useState('');

  const estimate = useMemo(() => {
    const historyTokens = messages.reduce((sum, message) => {
      return (
        sum +
        message.parts.reduce((acc, part) => {
          if (part.type === 'text') return acc + estimateTokens(part.text);
          if (part.type === 'reasoning') return acc + estimateTokens(part.text);
          return acc;
        }, 0)
      );
    }, 0);
    const total = estimateTokens(draft) + historyTokens + estimateTokens(systemPrompt);

    const pricing =
      mode === 'manual' ? models.find((m) => m.id === model) ?? null : null;
    let estimatedCost: number | undefined;
    if (pricing) {
      const promptPrice = Number(pricing.promptPrice);
      const completionPrice = Number(pricing.completionPrice);
      if (Number.isFinite(promptPrice) && Number.isFinite(completionPrice)) {
        estimatedCost =
          total * promptPrice + PROJECTED_OUTPUT_TOKENS * completionPrice;
      }
    }
    return { total, estimatedCost };
  }, [draft, messages, systemPrompt, mode, model, models]);

  const handleSubmit = (message: PromptInputMessage) => {
    const text = message.text.trim();
    if (!text) return;
    onSend(text);
    setDraft('');
  };

  return (
    <div className="bg-background/80 supports-[backdrop-filter]:bg-background/60 border-t p-3 backdrop-blur">
      <div className="mx-auto max-w-3xl">
        <PromptInput onSubmit={handleSubmit}>
          <PromptInputBody>
            <PromptInputTextarea
              value={draft}
              onChange={(e) => setDraft(e.currentTarget.value)}
              placeholder="Ask a question… (Enter to send, Shift+Enter for newline)"
              rows={2}
            />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputTools>
              <span
                className="text-muted-foreground text-xs tabular-nums"
                title="Token estimate covers the system prompt, history, and your draft; projected cost assumes ~512 output tokens."
              >
                ≈ {estimate.total.toLocaleString()} tokens
                {' · '}
                est.{' '}
                {estimate.estimatedCost !== undefined
                  ? formatCost(estimate.estimatedCost)
                  : mode === 'auto'
                    ? '— (priced per request)'
                    : model
                      ? 'free'
                      : '— (pick a model)'}
              </span>
            </PromptInputTools>
            <PromptInputSubmit status={status} onStop={onStop} disabled={!draft.trim()} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}
