'use client';

import { Fragment } from 'react';
import { Loader } from 'lucide-react';
import { durationOf, modelOf, usageOf } from '@/lib/message-utils';
import {
  formatCost,
  formatDuration,
  formatFullTimestamp,
  formatTimestamp,
  formatTokens,
} from '@/lib/format';
import type { ChatUIMessage, LiveUsage } from '@/lib/types';

function Stamp({ iso }: { iso: string }) {
  const short = formatTimestamp(iso);
  if (!short) return null;
  return (
    <time dateTime={iso} title={formatFullTimestamp(iso)} className="tabular-nums">
      {short}
    </time>
  );
}

/** Model / tokens / cost / latency as one muted line — the per-turn cost receipt. */
export function UsageLine({
  message,
  streaming,
  routing,
  live,
  timestamp,
}: {
  message: Pick<ChatUIMessage, 'parts'> & { metadata?: ChatUIMessage['metadata'] };
  streaming?: boolean;
  routing?: string;
  /** In-flight estimate (issues #12/#14); shown with ≈ marks until real usage lands. */
  live?: LiveUsage | null;
  /** ISO time the turn was asked; leads the line when present. */
  timestamp?: string;
}) {
  const usage = usageOf(message);
  const model = modelOf(message);
  const durationMs = durationOf(message);
  const fallbackFrom = message.metadata?.fallbackFrom;
  // Smart Auto's recorded decision — hover detail on the model name.
  const routingMeta = message.metadata?.routing;
  const routingHint = routingMeta
    ? `${routingMeta.reason} — routed by ${routingMeta.routerModel} (${Math.round(routingMeta.confidence * 100)}% confidence)`
    : undefined;

  if (streaming) {
    return (
      <div className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs">
        {timestamp ? (
          <>
            <Stamp iso={timestamp} />
            <span aria-hidden>·</span>
          </>
        ) : null}
        <Loader className="size-3 animate-spin" />
        {routing ? `routing via ${routing}…` : 'answering…'}
        {live ? (
          <>
            <span aria-hidden>·</span>
            <span
              className="tabular-nums"
              title={`o200k estimate — in ≈${formatTokens(live.inputTokens)} · out ≈${formatTokens(live.outputTokens)}; excludes the system prompt`}
            >
              ≈ {formatTokens(live.inputTokens + live.outputTokens)} tok
            </span>
            {live.cost !== null ? (
              <span className="tabular-nums" title="Estimated from catalog pricing">
                ≈ {formatCost(live.cost)}
              </span>
            ) : null}
          </>
        ) : null}
      </div>
    );
  }

  const facts = [
    { key: 'time', node: timestamp ? <Stamp iso={timestamp} /> : null },
    {
      key: 'model',
      node: model ? (
        <span className="max-w-64 truncate" title={routingHint}>
          {model}
        </span>
      ) : null,
    },
    {
      key: 'fallback',
      node: fallbackFrom ? (
        <span
          className="text-amber-600 dark:text-amber-400"
          title="A rate limit or quota error triggered an automatic fallback"
        >
          fell back from {fallbackFrom}
        </span>
      ) : null,
    },
    {
      key: 'tokens',
      node: usage ? (
        <span className="tabular-nums">{formatTokens(usage.totalTokens)} tok</span>
      ) : null,
    },
    {
      key: 'cost',
      node: usage ? (
        <span
          className="tabular-nums"
          title={`in ${formatTokens(usage.inputTokens)} · out ${formatTokens(usage.outputTokens)}`}
        >
          {formatCost(usage.cost)}
        </span>
      ) : null,
    },
    {
      key: 'duration',
      node: durationMs ? (
        <span className="tabular-nums">{formatDuration(durationMs)}</span>
      ) : null,
    },
  ].filter((fact) => fact.node !== null);

  if (facts.length === 0) return null;

  return (
    <div className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs">
      {facts.map((fact, i) => (
        <Fragment key={fact.key}>
          {i > 0 ? <span aria-hidden>·</span> : null}
          {fact.node}
        </Fragment>
      ))}
    </div>
  );
}
