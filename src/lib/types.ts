import type { UIMessage } from 'ai';

export type ChatMode = 'auto' | 'free' | 'manual';

/** Cost/usage truth for a completed turn (USD). */
export type TurnUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost?: number;
};

export type ChatMessageMetadata = {
  /**
   * ISO time the turn was created: the DB row's created_at once persisted, the
   * client clock while a live turn is still streaming. User turns carry only this.
   */
  createdAt?: string;
  mode?: ChatMode;
  /** Slug (or mode slug like openrouter/auto) that was requested. */
  requestedModel?: string;
  /** Slug that actually answered (resolved after fallback/routing). */
  model?: string;
  /** Set when a rate-limit/quota error caused a fallback to another model. */
  fallbackFrom?: string;
  usage?: TurnUsage;
  durationMs?: number;
  error?: string;
};

/** A previous answer for the same question (regenerate / try-another-model). */
export type MessageVariant = {
  parts: ChatUIMessage['parts'];
  metadata?: ChatMessageMetadata;
};

export type ChatDataTypes = {
  /** Transient: consumed by useChat's onData for the fallback toast. */
  fallback: { from: string; to: string; reason: string };
  /** Written once per turn so cost badges render before a refetch. */
  cost: {
    model: string;
    fallbackFrom?: string;
    usage?: TurnUsage;
    durationMs?: number;
  };
  /** Sent at the start of a regenerate turn so the branch UI exists while streaming. */
  variants: { variants: MessageVariant[] };
  /**
   * Transient: the heuristic title at stream start, then the AI title the
   * moment it finishes generating (mid-answer).
   */
  title: { title: string };
};

export type ChatUIMessage = UIMessage<ChatMessageMetadata, ChatDataTypes>;

export type ChatSummary = {
  id: string;
  title: string;
  pinned: boolean;
  mode: ChatMode;
  model: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * Client view of the settings row. The API key itself never reaches the
 * browser — only whether one is stored, plus a non-secret "…last4" hint.
 */
export type UserSettings = {
  apiKeySet: boolean;
  keyHint: string | null;
  defaultModel: string;
  systemPrompt: string;
};

export type OpenRouterModel = {
  id: string;
  name: string;
  contextLength: number;
  /** USD per token, as strings from OpenRouter (e.g. "0.0000015"). */
  promptPrice: string;
  completionPrice: string;
};

export const AUTO_MODEL = 'openrouter/auto';
export const FREE_MODEL = 'openrouter/free';
