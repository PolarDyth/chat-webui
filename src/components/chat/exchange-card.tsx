'use client';

import { Fragment, memo, useState } from 'react';
import { Copy, Pencil, RefreshCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  MessageAction,
  MessageActions,
  MessageBranch,
  MessageBranchContent,
  MessageBranchNext,
  MessageBranchPage,
  MessageBranchPrevious,
  MessageBranchSelector,
  MessageResponse,
  MessageToolbar,
} from '@/components/ai-elements/message';
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '@/components/ai-elements/reasoning';
import { Shimmer } from '@/components/ai-elements/shimmer';
import { ModelPicker } from '@/components/chat/model-picker';
import { UsageLine } from '@/components/chat/usage-line';
import { textOf, variantsOf } from '@/lib/message-utils';
import type { ChatUIMessage, LiveUsage, OpenRouterModel } from '@/lib/types';

function ReasoningBlock({ message, streaming }: { message: ChatUIMessage; streaming: boolean }) {
  const reasoningParts = message.parts.filter(
    (p): p is { type: 'reasoning'; text: string } => p.type === 'reasoning',
  );
  const reasoningText = reasoningParts.map((p) => p.text).join('\n\n');
  if (!reasoningText) return null;
  const isReasoningStreaming = streaming && message.parts.at(-1)?.type === 'reasoning';
  return (
    <Reasoning className="w-full" isStreaming={isReasoningStreaming}>
      <ReasoningTrigger />
      <ReasoningContent>{reasoningText}</ReasoningContent>
    </Reasoning>
  );
}

function AnswerBody({ parts }: { parts: ChatUIMessage['parts'] }) {
  const text = parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('\n\n');
  if (!text) return null;
  return <MessageResponse>{text}</MessageResponse>;
}

/** One turn in the thread: question, thin usage line, then the answer — a single flat block. */
function ExchangeCardBase({
  userMessage,
  assistantMessage,
  answerStreaming,
  editable,
  routingModel,
  liveUsage,
  models,
  modelsLoading,
  onRegenerate,
  onSelectVariant,
  onEdit,
}: {
  userMessage?: ChatUIMessage;
  assistantMessage?: ChatUIMessage;
  answerStreaming: boolean;
  /** False while any turn is streaming — editing then would abort the live answer. */
  editable: boolean;
  routingModel?: string;
  /** Live token/cost estimate for the in-flight turn (issues #12/#14). */
  liveUsage?: LiveUsage | null;
  models: OpenRouterModel[];
  modelsLoading: boolean;
  onRegenerate: (options?: { messageId?: string; modelOverride?: string }) => void;
  onSelectVariant: (message: ChatUIMessage, variantIndex: number) => void;
  onEdit: (message: ChatUIMessage, text: string) => void;
}) {
  const questionText = userMessage ? textOf(userMessage) : '';
  const askedAt = userMessage?.metadata?.createdAt;
  const variants = assistantMessage ? variantsOf(assistantMessage) : [];
  const hasBranches = variants.length > 0;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const startEdit = () => {
    setDraft(questionText);
    setEditing(true);
  };
  const cancelEdit = () => setEditing(false);
  const commitEdit = () => {
    const next = draft.trim();
    setEditing(false);
    if (userMessage && next && next !== questionText.trim()) onEdit(userMessage, next);
  };

  const answerContent = assistantMessage ? (
    <Fragment key="current">
      <ReasoningBlock message={assistantMessage} streaming={answerStreaming} />
      <AnswerBody parts={assistantMessage.parts} />
    </Fragment>
  ) : null;

  const actionsRow = assistantMessage ? (
    <MessageActions>
      <MessageAction
        label="Copy answer"
        tooltip="Copy"
        onClick={() => {
          void navigator.clipboard.writeText(textOf(assistantMessage));
          toast.success('Copied');
        }}
      >
        <Copy />
      </MessageAction>
      <MessageAction
        label="Regenerate"
        tooltip="Regenerate"
        onClick={() => onRegenerate({ messageId: assistantMessage.id })}
      >
        <RefreshCcw />
      </MessageAction>
      <ModelPicker
        models={models}
        loading={modelsLoading}
        onSelect={(id) => onRegenerate({ messageId: assistantMessage.id, modelOverride: id })}
        placeholder="Try another model…"
        triggerClassName="h-7 gap-1 rounded-md px-2 text-xs"
      />
    </MessageActions>
  ) : null;

  const toolbarClassName =
    'mt-0 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 [@media(pointer:coarse)]:opacity-100';

  return (
    <article className="group flex flex-col gap-2" aria-label="Exchange">
      {userMessage && editing ? (
        <div className="ml-auto w-full max-w-[85%] rounded-2xl bg-muted p-1.5">
          <Textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                cancelEdit();
              } else if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                commitEdit();
              }
            }}
            aria-label="Edit question"
            className="border-0 bg-transparent text-sm shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent"
          />
          <div className="flex items-center gap-1 px-1.5 pb-0.5">
            <span className="text-muted-foreground mr-auto text-xs">
              Enter to resend · Esc to cancel
            </span>
            <Button variant="ghost" size="xs" onClick={cancelEdit}>
              Cancel
            </Button>
            <Button size="xs" onClick={commitEdit} disabled={!draft.trim()}>
              Resend
            </Button>
          </div>
        </div>
      ) : userMessage ? (
        <div className="flex items-center justify-end gap-1">
          {editable ? (
            <MessageAction
              label="Edit question"
              tooltip="Edit"
              onClick={startEdit}
              className={toolbarClassName}
            >
              <Pencil />
            </MessageAction>
          ) : null}
          <div className="w-fit max-w-[85%] rounded-2xl bg-muted px-3.5 py-2.5">
            <MessageResponse className="text-sm">{questionText}</MessageResponse>
          </div>
        </div>
      ) : null}

      <UsageLine
        message={assistantMessage ?? { parts: [] }}
        streaming={answerStreaming}
        routing={assistantMessage ? undefined : routingModel}
        live={answerStreaming ? liveUsage : undefined}
        timestamp={askedAt}
      />

      {!assistantMessage && answerStreaming ? (
        <Shimmer className="text-muted-foreground text-sm">
          {routingModel ? `Routing via ${routingModel}…` : 'Thinking…'}
        </Shimmer>
      ) : null}

      {!assistantMessage && !answerStreaming && userMessage ? (
        <div className="text-muted-foreground flex items-center justify-between gap-3 text-sm">
          <span>No answer was saved for this turn — the request did not complete.</span>
          <Button variant="outline" size="sm" onClick={() => onRegenerate()}>
            Retry
          </Button>
        </div>
      ) : null}

      {assistantMessage && !hasBranches ? answerContent : null}

      {assistantMessage && hasBranches ? (
        // Branch context must wrap BOTH the variant content and the selector.
        // Rendered for the whole turn once variants are known (sent up front
        // on regenerates), so completing a stream only adds the footer — the
        // answer content never swaps trees mid-flight.
        <MessageBranch
          defaultBranch={variants.length}
          onBranchChange={(branchIndex) => {
            // The current answer is the last branch; earlier indices are stored variants.
            if (branchIndex < variants.length) {
              onSelectVariant(assistantMessage, branchIndex);
            }
          }}
        >
          <MessageBranchContent>
            {variants.map((variant, i) => (
              <Fragment key={i}>
                {variant.metadata ? (
                  <UsageLine message={{ parts: variant.parts, metadata: variant.metadata }} />
                ) : null}
                <AnswerBody parts={variant.parts} />
              </Fragment>
            ))}
            {answerContent}
          </MessageBranchContent>
          {!answerStreaming ? (
            <MessageToolbar className={toolbarClassName}>
              {actionsRow}
              <MessageBranchSelector>
                <MessageBranchPrevious />
                <MessageBranchPage />
                <MessageBranchNext />
              </MessageBranchSelector>
            </MessageToolbar>
          ) : null}
        </MessageBranch>
      ) : null}

      {assistantMessage && !hasBranches && !answerStreaming ? (
        <MessageToolbar className={toolbarClassName}>{actionsRow}</MessageToolbar>
      ) : null}
    </article>
  );
}

export const ExchangeCard = memo(ExchangeCardBase);
