import type { ChatUIMessage, MessageVariant, TurnUsage } from '@/lib/types';

type CostPart = { type: 'data-cost'; data: { model: string; usage?: TurnUsage; durationMs?: number } };

type MessageLike = Pick<ChatUIMessage, 'parts'> & { metadata?: ChatUIMessage['metadata'] };

export function costPartOf(message: MessageLike): CostPart | undefined {
  return message.parts.find((p): p is CostPart => p.type === 'data-cost');
}

export function usageOf(message: MessageLike): TurnUsage | undefined {
  return message.metadata?.usage ?? costPartOf(message)?.data.usage;
}

export function modelOf(message: MessageLike): string | undefined {
  return message.metadata?.model ?? costPartOf(message)?.data.model;
}

export function durationOf(message: MessageLike): number | undefined {
  return message.metadata?.durationMs ?? costPartOf(message)?.data.durationMs;
}

/** Text + reasoning of a message — the billed output surface for live estimates. */
export function streamTextOf(message: Pick<ChatUIMessage, 'parts'>): string {
  return message.parts
    .filter(
      (p): p is { type: 'text' | 'reasoning'; text: string } =>
        p.type === 'text' || p.type === 'reasoning',
    )
    .map((p) => p.text)
    .join('');
}

type VariantsPart = { type: 'data-variants'; data: { variants: MessageVariant[] } };

export function variantsOf(message: ChatUIMessage): MessageVariant[] {
  // Chats GET hydrates the DB variants column into metadata; mid-stream, the
  // server sends the same list as a data-variants part so the branch UI exists
  // while the regenerate is still streaming.
  const fromMetadata = (message.metadata as { variants?: MessageVariant[] } | null | undefined)
    ?.variants;
  if (fromMetadata && fromMetadata.length > 0) return fromMetadata;
  const part = message.parts.find((p): p is VariantsPart => p.type === 'data-variants');
  return part?.data.variants ?? [];
}

/** Total spend of a conversation, in USD. */
export function totalCostOf(messages: ChatUIMessage[]): number {
  return messages.reduce((sum, m) => sum + (usageOf(m)?.cost ?? 0), 0);
}

export function textOf(message: ChatUIMessage): string {
  return message.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('');
}

function sameMessage(a: ChatUIMessage, b: ChatUIMessage): boolean {
  return (
    a.role === b.role &&
    JSON.stringify(a.parts) === JSON.stringify(b.parts) &&
    JSON.stringify(a.metadata ?? null) === JSON.stringify(b.metadata ?? null)
  );
}

/**
 * Fold DB rows into the live message array at end-of-turn sync. Unchanged
 * messages keep their object identity so memoized cards don't re-render;
 * enriched rows (metadata, variants) swap in; rows the client has not seen are
 * appended. Client-only messages (e.g. an answer stopped mid-stream that was
 * never persisted) are never dropped.
 */
export function hydrateMessages(prev: ChatUIMessage[], fetched: ChatUIMessage[]): ChatUIMessage[] {
  const rows = new Map(fetched.map((m) => [m.id, m]));
  const merged = prev.map((message) => {
    const row = rows.get(message.id);
    if (!row) return message;
    rows.delete(message.id);
    return sameMessage(message, row) ? message : row;
  });
  merged.push(...rows.values());
  return merged;
}
