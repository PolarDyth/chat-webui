import { formatCost, formatDuration, formatTokens } from '@/lib/format';
import { durationOf, modelOf, usageOf } from '@/lib/message-utils';
import type { ChatUIMessage } from '@/lib/types';

function joinParts(message: ChatUIMessage, type: 'text' | 'reasoning'): string {
  return message.parts
    .filter((p) => p.type === type)
    .map((p) => ('text' in p ? p.text.trim() : ''))
    .filter(Boolean)
    .join('\n\n');
}

/** The transcript as a standalone Markdown document, receipts included. */
export function chatToMarkdown(title: string, messages: ChatUIMessage[]): string {
  const lines: string[] = [`# ${title.trim() || 'Chat'}`, ''];

  for (const message of messages) {
    if (message.role === 'user') {
      lines.push('## You', '', joinParts(message, 'text'), '');
      continue;
    }
    if (message.role !== 'assistant') continue;

    const usage = usageOf(message);
    const duration = durationOf(message);
    const receipt = [
      usage ? `${formatTokens(usage.totalTokens)} tok` : null,
      usage ? formatCost(usage.cost) : null,
      duration ? formatDuration(duration) : null,
    ]
      .filter(Boolean)
      .join(' · ');

    lines.push(`## ${modelOf(message) ?? 'Assistant'}`, '');
    if (receipt) lines.push(`> ${receipt}`, '');
    const reasoning = joinParts(message, 'reasoning');
    if (reasoning) {
      lines.push('<details>', '<summary>Reasoning</summary>', '', reasoning, '', '</details>', '');
    }
    lines.push(joinParts(message, 'text'), '');
  }

  return lines.join('\n').trimEnd() + '\n';
}

export function markdownFilename(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${slug || 'chat'}.md`;
}

export function downloadTextFile(filename: string, content: string, mime = 'text/markdown'): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  // Give the browser a tick to start the download before the URL goes away.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
