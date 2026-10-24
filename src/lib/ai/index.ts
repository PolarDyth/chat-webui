import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { AUTO_MODEL, FREE_MODEL, type ChatMode, type OpenRouterModel } from '@/lib/types';

export const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';

/**
 * Hard cap on per-request provider fan-out: the fallback chain never tries
 * more than this many models for one turn (plus at most one title-generation
 * call on a brand-new chat).
 */
export const MAX_MODEL_CANDIDATES = 4;

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

let freeModelsCache: { at: number; models: string[] } | null = null;

/** Highest-context zero-cost models, used as automatic fallback targets. */
export async function getTopFreeModels(count: number): Promise<string[]> {
  if (freeModelsCache && Date.now() - freeModelsCache.at < 60 * 60 * 1000) {
    return freeModelsCache.models.slice(0, count);
  }
  try {
    const res = await fetch(OPENROUTER_MODELS_URL, { next: { revalidate: 3600 } });
    if (!res.ok) return freeModelsCache?.models.slice(0, count) ?? [];
    const json = (await res.json()) as { data?: Array<Record<string, unknown>> };
    const models = (json.data ?? [])
      .filter((m) => {
        const pricing = m.pricing as { prompt?: string } | undefined;
        if (pricing?.prompt !== '0') return false;
        // The free list mixes in music/image models (lyria…); chat only wants text.
        const out = (m.architecture as { output_modalities?: string[] } | undefined)
          ?.output_modalities;
        return !out || out.includes('text');
      })
      .sort((a, b) => Number(b.context_length ?? 0) - Number(a.context_length ?? 0))
      .map((m) => String(m.id));
    freeModelsCache = { at: Date.now(), models };
    return models.slice(0, count);
  } catch {
    return freeModelsCache?.models.slice(0, count) ?? [];
  }
}

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
