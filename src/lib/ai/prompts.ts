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
