/**
 * Hand-curated routing annotations for OpenRouter's catalog, verified against
 * the live /api/v1/models listing on 2026-10-24. Only annotated slugs are ever
 * routed to — the catalog churns weekly, so anything not listed here is
 * intentionally unroutable (it can still answer via the fallback chain).
 *
 * Prices move; tiers/strengths are the stable part. When OpenRouter renames a
 * slug, drop it here — the shortlist silently skips missing entries — and add
 * its successor after checking the catalog.
 */

export type ModelTier = 'frontier' | 'strong' | 'efficient';

export type ModelStrength = 'quick' | 'general' | 'code' | 'math' | 'writing' | 'reasoning' | 'agentic';

export type ModelAnnotation = {
  tier: ModelTier;
  strengths: ModelStrength[];
};

export const MODEL_ANNOTATIONS: Record<string, ModelAnnotation> = {
  // Frontier — genuinely hard problems only (complex algorithms, subtle
  // architecture, long analytical work).
  'anthropic/claude-opus-5.5': { tier: 'frontier', strengths: ['reasoning', 'writing'] },
  'openai/gpt-6-sol': { tier: 'frontier', strengths: ['reasoning', 'code', 'agentic'] },
  'google/gemini-3.1-pro-preview': { tier: 'frontier', strengths: ['reasoning', 'general'] },
  'x-ai/grok-4.7': { tier: 'frontier', strengths: ['general', 'reasoning'] },

  // Strong — the default workhorses for most real work.
  'anthropic/claude-sonnet-5.5': { tier: 'strong', strengths: ['code', 'writing', 'agentic'] },
  'openai/gpt-5.2': { tier: 'strong', strengths: ['general', 'reasoning'] },
  'google/gemini-3.8-flash': { tier: 'strong', strengths: ['quick', 'general'] },
  'deepseek/deepseek-v4-pro': { tier: 'strong', strengths: ['math', 'reasoning'] },
  'deepseek/deepseek-chat': { tier: 'strong', strengths: ['general', 'quick'] },
  'moonshotai/kimi-k2.6': { tier: 'strong', strengths: ['agentic', 'code'] },
  'z-ai/glm-5.3': { tier: 'strong', strengths: ['general', 'code'] },
  'minimax/minimax-m3': { tier: 'strong', strengths: ['agentic', 'code'] },
  'mistralai/mistral-large-2512': { tier: 'strong', strengths: ['general', 'writing'] },
  'qwen/qwen3-coder-next': { tier: 'strong', strengths: ['code'] },
  'openai/gpt-5.1-codex-mini': { tier: 'strong', strengths: ['code'] },
  'qwen/qwen3.8-27b': { tier: 'strong', strengths: ['general'] },

  // Efficient — everyday chat, simple questions, short rewrites.
  'google/gemini-3.5-flash-lite': { tier: 'efficient', strengths: ['quick', 'general'] },
  'anthropic/claude-haiku-5.5': { tier: 'efficient', strengths: ['quick', 'writing'] },
  'openai/gpt-6-luna': { tier: 'efficient', strengths: ['quick', 'general'] },
  'deepseek/deepseek-v4.1-flash': { tier: 'efficient', strengths: ['quick', 'general'] },
  'z-ai/glm-5.3-flash': { tier: 'efficient', strengths: ['quick', 'general'] },
  'qwen/qwen3.8-flash': { tier: 'efficient', strengths: ['quick', 'general'] },
  'openai/gpt-oss-120b': { tier: 'efficient', strengths: ['general', 'code'] },
  'mistralai/mistral-small-2603': { tier: 'efficient', strengths: ['quick', 'general'] },
};

/**
 * Built-in Smart Auto classifier, used when the user hasn't picked one in
 * Settings. nvidia/nemotron-3.5-lightning:free is the fastest free model that
 * reliably answers structured-output calls on a free-tier account (measured
 * ~0.7s, Oct 2026; openrouter/free auto-routing and most other free slugs sit
 * at or past the 2.5s cap or are guardrail-excluded). Users override this in
 * Settings (routerModel) or via OPENROUTER_ROUTER_MODEL.
 */
export const DEFAULT_ROUTER_MODEL = 'nvidia/nemotron-3.5-lightning:free';
