import { createHash } from 'node:crypto';
import { generateObject } from 'ai';
import { z } from 'zod';
import { createProvider } from '@/lib/ai';
import type { ChatUIMessage, RoutingDecision } from '@/lib/types';
import { DEFAULT_ROUTER_MODEL } from './annotations';
import { buildFreeShortlist, buildShortlist } from './shortlist';

/**
 * The LLM half of Smart Auto: classifies the prompt against the shortlist and
 * picks one model. Fails closed — any error, hallucinated slug, or timeout
 * returns null and the caller keeps today's behavior (openrouter/auto).
 */

const ROUTE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const ROUTE_CACHE_MAX = 200;
/** Hard cap on classification latency before the turn routes like today.
 *  The default free classifier (nemotron) is reasoning-heavy and currently
 *  often exceeds this — such turns degrade cleanly to openrouter/auto. A
 *  faster classifier (Settings → Smart Auto) makes routing land reliably. */
const ROUTER_TIMEOUT_MS = 3000;
/** Bump to invalidate the in-memory route cache after prompt changes. */
const ROUTER_PROMPT_VERSION = 1;

const ROUTER_SYSTEM_PROMPT = `You are the model router for a chat app. Pick the best candidate model for the user's latest message, balancing answer quality against price.

Tiers:
- efficient (~under $0.50/1M tokens): everyday chat, simple factual questions, short rewrites, quick explanations.
- strong ($0.50-$2/1M): most real work — solid code, nuanced writing, multi-step reasoning, long conversations.
- frontier ($2+/1M): genuinely hard problems — complex algorithms, subtle system design, dense analytical documents.

Rules:
- Choose the cheapest tier you are confident can handle the task well; escalate only for hard code, math, reasoning, or very long context.
- Hard requirements outrank price: if the message includes an image, only models listed with vision qualify; if the conversation is near a model's context window, exclude it.
- The same model should be picked consistently for the same message.

Respond with the chosen model's exact id, a 0-1 confidence, and a one-sentence reason.`;

const decisionSchema = z.object({
  modelId: z.string(),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
});

const routeCache = new Map<string, { at: number; decision: RoutingDecision }>();

function cacheKey(
  latestUserText: string,
  digest: string,
  routerModel: string,
  freeOnly: boolean,
): string {
  return createHash('sha256')
    .update(`${ROUTER_PROMPT_VERSION}|${routerModel}|${freeOnly ? 'free' : 'any'}|${digest}|${latestUserText}`)
    .digest('hex');
}

function cacheDecision(key: string, decision: RoutingDecision): void {
  if (routeCache.size >= ROUTE_CACHE_MAX) {
    const oldest = routeCache.keys().next().value;
    if (oldest) routeCache.delete(oldest);
  }
  routeCache.set(key, { at: Date.now(), decision });
}

/** Earlier user turns, truncated, so follow-ups route with conversation context. */
export function digestFromMessages(messages: ChatUIMessage[]): string {
  const texts = messages
    .filter((m) => m.role === 'user')
    .map((m) =>
      m.parts
        .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
        .map((p) => p.text)
        .join(' ')
        .trim(),
    )
    .filter(Boolean)
    .slice(0, -1) // the latest turn is passed separately
    .slice(-6);
  return texts.map((t) => `- ${t.slice(0, 240)}`).join('\n');
}

export async function routeAuto(opts: {
  apiKey: string;
  latestUserText: string;
  digest: string;
  /** Slug picked in Settings ('' / null = default); env overrides the default. */
  routerModel?: string | null;
  /** Route only to zero-cost models (the "free only" Smart Auto option). */
  freeOnly: boolean;
}): Promise<RoutingDecision | null> {
  const promptText = `${opts.digest}\n${opts.latestUserText}`.trim();
  if (!promptText) return null;

  const routerModel =
    opts.routerModel?.trim() ||
    process.env.OPENROUTER_ROUTER_MODEL?.trim() ||
    DEFAULT_ROUTER_MODEL;

  const key = cacheKey(opts.latestUserText, opts.digest, routerModel, opts.freeOnly);
  const cached = routeCache.get(key);
  if (cached && Date.now() - cached.at < ROUTE_CACHE_TTL_MS) return cached.decision;

  try {
    const shortlist = await (opts.freeOnly ? buildFreeShortlist : buildShortlist)(promptText);
    if (shortlist.length === 0) return null;

    const catalog = shortlist
      .map(
        (m) =>
          `${m.id} — ${m.tier} — ${m.strengths.join('/') || 'general'} — $${m.promptPrice}/${
            m.completionPrice
          } per 1M — ctx ${m.contextLength}${m.vision ? ', vision' : ''}`,
      )
      .join('\n');

    const provider = createProvider(opts.apiKey);
    // One attempt with the whole budget: the free-pool default is slow but
    // does answer, and a paid override answers well under the cap. The
    // in-budget retry below covers transient empty responses.
    const object = await classifyWith(provider, routerModel, {
      catalog,
      digest: opts.digest,
      latestUserText: opts.latestUserText,
      budgetMs: ROUTER_TIMEOUT_MS,
    });
    if (!object) return null;

    const { modelId, confidence, reason } = object;
    if (!shortlist.some((m) => m.id === modelId)) {
      console.warn('[router] classifier returned a non-candidate slug:', modelId);
      return null;
    }

    const decision: RoutingDecision = {
      modelId,
      confidence: Math.min(1, Math.max(0, confidence)),
      reason: reason.slice(0, 200),
      shortlist: shortlist.map((m) => m.id),
      routerModel,
      freeOnly: opts.freeOnly,
    };
    cacheDecision(key, decision);
    return decision;
  } catch (error) {
    // Expected: timeout (AbortSignal), router-model hiccups, catalog outage.
    console.warn(
      '[router] classification failed, falling back:',
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

async function classifyWith(
  provider: ReturnType<typeof createProvider>,
  slug: string,
  opts: { catalog: string; digest: string; latestUserText: string; budgetMs: number },
): Promise<z.infer<typeof decisionSchema> | null> {
  try {
    const result = await generateObject({
      model: provider.chat(slug),
      schema: decisionSchema,
      system: ROUTER_SYSTEM_PROMPT,
      prompt: [
        'Candidate models (pick exactly one id from this list):',
        opts.catalog,
        '',
        opts.digest ? `Earlier turns in this conversation:\n${opts.digest}\n` : '',
        `Latest message:\n${opts.latestUserText.slice(0, 4000)}`,
      ].join('\n'),
      temperature: 0.2,
      // OpenRouter's max_tokens covers reasoning too — reasoning-style
      // classifiers (e.g. the nemotron default) need headroom past their
      // thinking phase to actually emit the JSON. The abort budget still caps
      // wall-clock latency; this only stops token-starved truncation.
      maxOutputTokens: 1200,
      // One in-budget retry shares the same abort signal, so transient empty
      // responses get a second chance without extending the total cap.
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(opts.budgetMs),
    });
    return result.object;
  } catch (error) {
    console.warn(
      '[router] candidate failed:',
      slug,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}
