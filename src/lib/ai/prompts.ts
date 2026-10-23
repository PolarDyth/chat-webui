import type { ModelMessage } from 'ai';
import type { ChatMode } from '@/lib/types';

/**
 * Single place where the system prompt is assembled. Future context sources
 * (memories, retrieved documents, tool results) inject here — callers and the
 * chat route never change.
 */
export function buildSystemPrompt(userSystemPrompt?: string | null): string {
  const parts: string[] = [];

  if (userSystemPrompt?.trim()) {
    parts.push(userSystemPrompt.trim());
  }

  parts.push(
    'Format answers in Markdown. Use fenced code blocks with language tags, and LaTeX ($...$ inline, $$...$$ display) for math.',
  );

  return parts.join('\n\n');
}

export function titleFromUserText(text: string): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  return cleaned.length > 80 ? `${cleaned.slice(0, 77)}…` : cleaned || 'New chat';
}

export const TITLE_SYSTEM_PROMPT = [
  'You write titles for chat conversations.',
  'Given the user\'s first message, reply with a short title of at most 6 words describing what the chat is about.',
  'Reply with the title only: no quotes, no trailing period, no preamble.',
  'Never mention the task or the word "title".',
  'Write in the same language as the message.',
].join(' ');

/** Examples that keep small free models from narrating the task instead of doing it. */
export const TITLE_EXAMPLES: ModelMessage[] = [
  { role: 'user', content: 'First message: Fixing a leaky kitchen faucet, where do I start?' },
  { role: 'assistant', content: 'fixing a leaky kitchen faucet' },
  { role: 'user', content: 'First message: Why is the sky blue?' },
  { role: 'assistant', content: 'why the sky is blue' },
];

const TITLE_MAX_LENGTH = 60;

/** Output tells the model narrated the task instead of answering; treat as a miss. */
const TITLE_META_LEAK_RE =
  /\b(the user|as an ai|i cannot|i'm sorry|system prompt|short title)\b/i;

/**
 * Model output hygiene: strip wrapping quotes, cap the length, and reject
 * meta-commentary. Null means "no usable title" (keep the heuristic one).
 */
export function cleanTitle(text: string): string | null {
  const cleaned = text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["'“”«»]+|["'“”«»]+$/g, '')
    .replace(/[.。]+$/, '')
    .trim();
  if (!cleaned || TITLE_META_LEAK_RE.test(cleaned)) return null;
  return cleaned.length > TITLE_MAX_LENGTH
    ? `${cleaned.slice(0, TITLE_MAX_LENGTH - 1).trimEnd()}…`
    : cleaned;
}

export function modeLabel(mode: ChatMode): string {
  switch (mode) {
    case 'auto':
      return 'Auto';
    case 'free':
      return 'Free';
    case 'manual':
      return 'Manual';
  }
}
