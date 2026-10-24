import { estimateTokens } from '@/lib/format';
import { OPENROUTER_MODELS_URL } from '@/lib/ai';
import { MODEL_ANNOTATIONS, type ModelTier } from './annotations';

/**
 * Heuristic prefilter: turns OpenRouter's full catalog into the short annotated
 * candidate list the classifier sees. Deterministic, no AI — hard constraints
 * (routable annotation, text output, context window) do the pruning.
 */

export type ShortlistModel = {
  id: string;
  name: string;
  tier: ModelTier;
  strengths: string[];
  contextLength: number;
  vision: boolean;
  /** USD per 1M tokens. */
  promptPrice: number;
  completionPrice: number;
};

export const SHORTLIST_CAP = 18;

type CatalogEntry = {
  id: string;
  name: string;
  contextLength: number;
  inputModalities: string[];
  outputModalities: string[];
  promptPrice: number;
  completionPrice: number;
};

let catalogCache: { at: number; entries: CatalogEntry[] } | null = null;

async function fetchCatalog(): Promise<CatalogEntry[]> {
  if (catalogCache && Date.now() - catalogCache.at < 60 * 60 * 1000) return catalogCache.entries;
  try {
    const res = await fetch(OPENROUTER_MODELS_URL, { next: { revalidate: 3600 } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { data?: Array<Record<string, unknown>> };
    const entries = (json.data ?? [])
      .map((m) => ({
        id: String(m.id ?? ''),
        name: String(m.name ?? m.id ?? ''),
        contextLength: Number(m.context_length ?? 0),
        inputModalities: ((m.architecture as { input_modalities?: string[] } | undefined)
          ?.input_modalities ?? []) as string[],
        outputModalities: ((m.architecture as { output_modalities?: string[] } | undefined)
          ?.output_modalities ?? []) as string[],
        promptPrice: Number((m.pricing as Record<string, unknown> | undefined)?.prompt ?? 0) * 1e6,
        completionPrice:
          Number((m.pricing as Record<string, unknown> | undefined)?.completion ?? 0) * 1e6,
      }))
      .filter((m) => m.id);
    catalogCache = { at: Date.now(), entries };
    return entries;
  } catch (error) {
    console.warn('[router] catalog fetch failed:', error instanceof Error ? error.message : error);
    return catalogCache?.entries ?? [];
  }
}

const TIER_ORDER: Record<ModelTier, number> = { efficient: 0, strong: 1, frontier: 2 };

/**
 * The annotated models that can actually serve this turn, cheapest-tier-first.
 * Free/manual modes never reach the router, so the shortlist is paid models by
 * construction (no annotated slug is a `:free`/`:batch` variant).
 */
export async function buildShortlist(promptText: string): Promise<ShortlistModel[]> {
  // ×4 headroom: output, history growth, and provider-side overhead.
  const neededContext = estimateTokens(promptText) * 4;
  const catalog = await fetchCatalog();

  const shortlist: ShortlistModel[] = [];
  for (const entry of catalog) {
    const annotation = MODEL_ANNOTATIONS[entry.id];
    if (!annotation) continue;
    if (!entry.outputModalities.includes('text')) continue;
    if (entry.contextLength < neededContext) continue;
    shortlist.push({
      id: entry.id,
      name: entry.name,
      tier: annotation.tier,
      strengths: annotation.strengths,
      contextLength: entry.contextLength,
      vision: entry.inputModalities.includes('image'),
      promptPrice: entry.promptPrice,
      completionPrice: entry.completionPrice,
    });
  }

  return shortlist
    .sort(
      (a, b) =>
        TIER_ORDER[a.tier] - TIER_ORDER[b.tier] ||
        a.promptPrice - b.promptPrice ||
        b.contextLength - a.contextLength,
    )
    .slice(0, SHORTLIST_CAP);
}

/**
 * Free-only variant of the prefilter, used when the user turns on "route only
 * to free models": every zero-cost text model that fits the prompt, no
 * annotations (the free pool churns weekly — model ids carry the signal).
 */
export async function buildFreeShortlist(promptText: string): Promise<ShortlistModel[]> {
  const neededContext = estimateTokens(promptText) * 4;
  const catalog = await fetchCatalog();

  return catalog
    .filter(
      (entry) =>
        entry.promptPrice === 0 &&
        entry.outputModalities.includes('text') &&
        entry.contextLength >= neededContext,
    )
    .map<ShortlistModel>((entry) => ({
      id: entry.id,
      name: entry.name,
      // Everything is $0 here, so tier labels carry no signal; the classifier
      // prompt reads them as "efficient".
      tier: 'efficient',
      strengths: [],
      contextLength: entry.contextLength,
      vision: entry.inputModalities.includes('image'),
      promptPrice: entry.promptPrice,
      completionPrice: entry.completionPrice,
    }))
    .sort((a, b) => b.contextLength - a.contextLength)
    .slice(0, SHORTLIST_CAP);
}
