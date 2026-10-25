import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { AUTO_MODEL, FREE_MODEL, type ChatMode, type OpenRouterModel } from '@/lib/types';

export const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';

/**
 * Hard cap on per-request provider fan-out: the fallback chain never tries
 * more than this many models for one turn (plus at most one title-generation
 * call on a brand-new chat).
 */
export const MAX_MODEL_CANDIDATES = 4;

/** Meta-slugs route per request on OpenRouter's side — they can never be pinned. */
export function isConcreteModelSlug(slug: string | null | undefined): slug is string {
  return Boolean(slug) && slug !== AUTO_MODEL && slug !== FREE_MODEL;
}

export type RoutingPlan = {
  /** Run the Smart Auto classifier this turn. */
  classify: boolean;
  /** freeOnly flag for the classifier call (the user's setting, forced on for free mode). */
  freeOnly: boolean;
  /** Concrete model already decided for this chat, reused instead of re-classifying. */
  pinnedModel: string | null;
};

/**
 * Decides how a turn routes (issue #18): the first routed turn in a chat
 * classifies once and pins the decision for every later turn, so answers
 * within one conversation don't hop between models. Manual mode never routes;
 * meta-slugs (openrouter/auto, openrouter/free) are never pinned, so a failed
 * or slow classification just leaves the pin unset for the next turn.
 */
export function planRouting(opts: {
  mode: ChatMode;
  /** The chat's stored routed_model, if any. */
  storedRoutedModel?: string | null;
  /** The user's route-only-to-free-models setting. */
  freeOnly: boolean;
}): RoutingPlan {
  if (opts.mode === 'manual') {
    return { classify: false, freeOnly: opts.freeOnly, pinnedModel: null };
  }
  const stored = opts.storedRoutedModel;
  if (isConcreteModelSlug(stored)) {
    return { classify: false, freeOnly: opts.freeOnly, pinnedModel: stored };
  }
  // Free mode must land on a zero-cost model even though it shares the
  // classifier with auto mode.
  return {
    classify: true,
    freeOnly: opts.mode === 'free' ? true : opts.freeOnly,
    pinnedModel: null,
  };
}

/** Picks the first model that actually answers a turn. */
export async function resolveModelCandidates(opts: {
  mode: ChatMode;
  model?: string | null;
  defaultModel?: string | null;
  /** Smart Auto's pick for this turn; auto mode falls back to openrouter/auto without one. */
  routedModel?: string | null;
  /**
   * When the user's free-only Smart Auto setting is on, the chain stays
   * free even when classification failed — openrouter/free replaces
   * openrouter/auto and the paid default model is skipped.
   */
  routedFreeOnly?: boolean;
}): Promise<string[]> {
  const list: string[] = [];

  if (opts.mode === 'manual' && opts.model) {
    list.push(opts.model);
  } else if (opts.mode === 'free') {
    list.push(FREE_MODEL);
  } else if (opts.routedModel) {
    list.push(opts.routedModel);
  } else if (opts.routedFreeOnly) {
    list.push(FREE_MODEL);
  } else {
    list.push(AUTO_MODEL);
  }

  if (!opts.routedFreeOnly && opts.defaultModel && !list.includes(opts.defaultModel)) {
    list.push(opts.defaultModel);
  }

  for (const free of await getTopFreeModels(2)) {
    if (!list.includes(free)) list.push(free);
  }

  return list.slice(0, MAX_MODEL_CANDIDATES);
}

type FreeModelCard = {
  id: string;
  name: string;
  contextLength: number;
};

let freeModelsCache: { at: number; models: FreeModelCard[] } | null = null;

async function getFreeModels(): Promise<FreeModelCard[]> {
  if (freeModelsCache && Date.now() - freeModelsCache.at < 60 * 60 * 1000) {
    return freeModelsCache.models;
  }
  try {
    const res = await fetch(OPENROUTER_MODELS_URL, { next: { revalidate: 3600 } });
    if (!res.ok) return freeModelsCache?.models ?? [];
    const json = (await res.json()) as { data?: Array<Record<string, unknown>> };
    const models = (json.data ?? [])
      .filter((m) => {
        const pricing = m.pricing as { prompt?: string } | undefined;
        if (pricing?.prompt !== '0') return false;
        // Chat needs text in and text-only out — the free list otherwise
        // mixes in music/image generators (lyria outputs text+audio).
        const modalities = (m.architecture as
          | { input_modalities?: string[]; output_modalities?: string[] }
          | undefined) ?? {};
        const input = modalities.input_modalities;
        if (input && !input.includes('text')) return false;
        const out = modalities.output_modalities;
        return !out || out.length === 0 || out.every((mod) => mod === 'text');
      })
      .sort((a, b) => Number(b.context_length ?? 0) - Number(a.context_length ?? 0))
      .map((m) => ({
        id: String(m.id),
        name: String(m.name ?? m.id),
        contextLength: Number(m.context_length ?? 0),
      }));
    freeModelsCache = { at: Date.now(), models };
    return models;
  } catch {
    return freeModelsCache?.models ?? [];
  }
}

/** Highest-context zero-cost models, used as automatic fallback targets. */
export async function getTopFreeModels(count: number): Promise<string[]> {
  return (await getFreeModels()).slice(0, count).map((m) => m.id);
}

/** Top zero-cost models with display metadata, for the landing page's live strip. */
export async function getTopFreeModelCards(count: number): Promise<FreeModelCard[]> {
  return (await getFreeModels()).slice(0, count);
}

export type { FreeModelCard };

export function mapOpenRouterModels(json: { data?: Array<Record<string, unknown>> }): OpenRouterModel[] {
  return (json.data ?? [])
    .map((m) => ({
      id: String(m.id ?? ''),
      name: String(m.name ?? m.id ?? ''),
      contextLength: Number(m.context_length ?? 0),
      promptPrice: String((m.pricing as Record<string, unknown> | undefined)?.prompt ?? '0'),
      completionPrice: String((m.pricing as Record<string, unknown> | undefined)?.completion ?? '0'),
    }))
    .filter((m) => m.id)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Rough retry classification from the provider error text. */
export function isRetryableModelError(errorText: string): boolean {
  return /\b(429|402|408|500|502|503|504|529)\b|rate.?limit|quota|credit|insufficient|overloaded|too many requests|capacity/i.test(
    errorText,
  );
}

export function createProvider(apiKey: string) {
  return createOpenRouter({
    apiKey,
    // Dev/testing hook: point at a local OpenRouter-compatible mock.
    ...(process.env.OPENROUTER_BASE_URL ? { baseURL: process.env.OPENROUTER_BASE_URL } : {}),
  });
}

/** Compute cost from pricing when OpenRouter doesn't return one (BYOK, etc.). */
export function computeCostFallback(
  model: OpenRouterModel | undefined,
  inputTokens: number,
  outputTokens: number,
): number | undefined {
  if (!model) return undefined;
  const prompt = Number(model.promptPrice);
  const completion = Number(model.completionPrice);
  if (!Number.isFinite(prompt) || !Number.isFinite(completion)) return undefined;
  return (inputTokens * prompt + outputTokens * completion) || 0;
}
