import { encode } from 'gpt-tokenizer';

/** Client-side token estimate (o200k — close enough for planning purposes). */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  try {
    return encode(text).length;
  } catch {
    return Math.ceil(text.length / 4);
  }
}

export function formatCost(cost: number | undefined | null): string {
  if (cost === undefined || cost === null || Number.isNaN(cost)) return '—';
  if (cost === 0) return 'free';
  if (cost < 0.0001) return `$${cost.toFixed(6)}`;
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(3)}`;
}

export function formatTokens(n: number | undefined | null): string {
  if (n === undefined || n === null) return '—';
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function formatDuration(ms: number | undefined | null): string {
  if (ms === undefined || ms === null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
