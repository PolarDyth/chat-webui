import { isRetryableModelError } from '@/lib/ai';

/**
 * The UI stream masks provider errors, so classify from the real thrown error.
 * Generic on purpose: provider response bodies and internal details stay in
 * the server log. The HTTP status stays in the text — the fallback retry
 * classifier (isRetryableModelError) reads it.
 */
export function describeUpstreamError(error: unknown): string | null {
  if (!error) return null;
  console.error('[chat] upstream provider error:', error);
  const status = statusOf(error);
  let text: string;
  if (status === 401 || status === 403) {
    text = 'The provider rejected the API key.';
  } else if (status === 402) {
    text = 'The account lacks credits for this model.';
  } else if (status === 404) {
    text = 'The selected model is unavailable.';
  } else if (status === 429) {
    text = 'The model is rate-limited right now.';
  } else if (status && status >= 500) {
    text = 'The model provider had a temporary error.';
  } else if (status) {
    text = 'The model provider returned an error.';
  } else {
    const raw = error instanceof Error ? error.message : String(error);
    // "overloaded" is deliberate: the retry classifier matches on it, so a
    // status-less retryable error (network flavor) keeps its fallback chain.
    text = isRetryableModelError(raw)
      ? 'The model provider is temporarily overloaded.'
      : 'The model request failed.';
  }
  return status ? `${text} (HTTP ${status})` : text;
}

function statusOf(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const e = error as { statusCode?: unknown; responseStatusCode?: unknown };
  const status = e.statusCode ?? e.responseStatusCode;
  return typeof status === 'number' && Number.isFinite(status) ? status : undefined;
}
