import { generateText } from 'ai';
import { TITLE_EXAMPLES, TITLE_SYSTEM_PROMPT, cleanTitle } from '@/lib/ai/prompts';
import { createProvider, getTopFreeModels } from '@/lib/ai';
import { FREE_MODEL } from '@/lib/types';

/**
 * AI chat title from the user's first message. Deliberately not streamed: the
 * caller gets the complete title (or null — keep the heuristic one) in a
 * single resolution, whenever a candidate model manages to produce one.
 */
export async function generateChatTitle(opts: {
  apiKey: string;
  defaultModel?: string | null;
  firstUserText: string;
}): Promise<string | null> {
  // Deeper free chain than chats use: a background nicety, so we'd rather
  // walk past several dead/gated free models than give up.
  const candidates = [
    FREE_MODEL,
    ...(opts.defaultModel?.trim() ? [opts.defaultModel.trim()] : []),
    ...(await getTopFreeModels(6)),
  ].filter((slug, index, all) => all.indexOf(slug) === index);
  const provider = createProvider(opts.apiKey);

  for (const slug of candidates) {
    try {
      const result = await generateText({
        model: provider.chat(slug),
        system: TITLE_SYSTEM_PROMPT,
        messages: [
          ...TITLE_EXAMPLES,
          { role: 'user', content: `First message: ${opts.firstUserText}` },
        ],
        // Room for reasoning-style free models, so they don't exhaust the
        // budget thinking and return empty text.
        maxOutputTokens: 512,
        temperature: 0.4,
      });
      const title = cleanTitle(result.text);
      if (title) return title;
      console.warn(
        '[ai-title] candidate returned unusable text:',
        slug,
        JSON.stringify(result.text).slice(0, 140),
      );
    } catch (error) {
      // Candidate dead (rate limit, quota, offline) — log and try the next one.
      console.warn(
        '[ai-title] candidate failed:',
        slug,
        error instanceof Error ? error.message : error,
      );
    }
  }
  return null;
}
