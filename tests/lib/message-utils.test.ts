import { describe, expect, it } from 'vitest';
import { streamTextOf, totalCostOf, usageOf } from '@/lib/message-utils';
import type { ChatUIMessage, TurnUsage } from '@/lib/types';

function message(parts: ChatUIMessage['parts'], metadata?: ChatUIMessage['metadata']): ChatUIMessage {
  return { id: 'm1', role: 'assistant', parts, metadata } as ChatUIMessage;
}

describe('streamTextOf', () => {
  it('joins text and reasoning parts — the billed output surface', () => {
    const text = streamTextOf(
      message([
        { type: 'reasoning', text: 'thinking' },
        { type: 'text', text: 'Hello ' },
        { type: 'text', text: 'world' },
      ]),
    );
    expect(text).toBe('thinkingHello world');
  });

  it('ignores non-prose parts like data-cost', () => {
    const usage: TurnUsage = { inputTokens: 1, outputTokens: 2, totalTokens: 3 };
    const text = streamTextOf(
      message([
        { type: 'text', text: 'answer' },
        { type: 'data-cost', data: { model: 'x/y', usage } },
      ]),
    );
    expect(text).toBe('answer');
  });

  it('returns an empty string for a bare message', () => {
    expect(streamTextOf(message([]))).toBe('');
  });
});

describe('usageOf / totalCostOf', () => {
  const usage: TurnUsage = { inputTokens: 10, outputTokens: 5, totalTokens: 15, cost: 0.02 };

  it('prefers metadata.usage over the data-cost part', () => {
    const withBoth = message(
      [{ type: 'data-cost', data: { model: 'x/y', usage: { ...usage, cost: 9 } } }],
      { usage },
    );
    expect(usageOf(withBoth)?.cost).toBe(0.02);
  });

  it('falls back to the data-cost part before metadata hydrates', () => {
    const partOnly = message([{ type: 'data-cost', data: { model: 'x/y', usage } }]);
    expect(usageOf(partOnly)).toEqual(usage);
  });

  it('sums per-message costs across metadata and data-cost sources (#14)', () => {
    const total = totalCostOf([
      message([{ type: 'text', text: 'a' }], { usage }),
      message([{ type: 'data-cost', data: { model: 'x/y', usage: { ...usage, cost: 0.03 } } }]),
      message([{ type: 'text', text: 'no usage yet' }]),
    ]);
    expect(total).toBeCloseTo(0.05, 10);
  });
});
