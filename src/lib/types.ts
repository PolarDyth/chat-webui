import type { UIMessage } from 'ai';

export type ChatMode = 'auto' | 'free' | 'manual';

/** Cost/usage truth for a completed turn (USD). */
export type TurnUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost?: number;
};

/**
 * Client-side live estimate for an in-flight turn (issues #12/#14): o200k
 * token counts from the streamed text, priced from the OpenRouter catalog.
 * Always labeled as an estimate in the UI — real usage replaces it at finish.
 */
export type LiveUsage = {
  inputTokens: number;
  outputTokens: number;
  /** USD estimate; null when the answering model or its price is unknown. */
  cost: number | null;
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
  /** Smart Auto's decision, when auto mode routed the turn. */
  routing?: {
    confidence: number;
    reason: string;
    /** Classifier model that made the call. */
    routerModel: string;
  };
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
  /** Transient: Smart Auto's pick for the in-flight turn, before content starts. */
  routing: { modelId: string; confidence: number; reason: string };
};

export type ChatUIMessage = UIMessage<ChatMessageMetadata, ChatDataTypes>;

/** What the Smart Auto router resolves for an auto-mode turn. */
export type RoutingDecision = {
  modelId: string;
  confidence: number;
  reason: string;
  /** Slugs the classifier chose from (diagnostics for /api/route). */
  shortlist: string[];
  /** Classifier model that made the call. */
  routerModel: string;
  /** Whether the choice was restricted to zero-cost models. */
  freeOnly: boolean;
};

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
  /** Smart Auto classifier slug; '' = built-in default. */
  routerModel: string;
  /** Route Auto mode only to zero-cost models. */
  routerFreeOnly: boolean;
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
