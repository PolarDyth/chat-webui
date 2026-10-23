import { tool } from 'ai';
import { z } from 'zod';

/**
 * Tool registry. Whatever is returned here is passed straight to streamText.
 *
 * To add a capability, create a file (e.g. `web-search.ts` exporting a `tool()`)
 * and register it below — the AI Elements Tool/Task components already render
 * tool calls in the UI. Planned: `webSearch` (Tavily/Exa), `saveMemory` /
 * `recallMemories` (backed by a `memories` table), `readPdf` (Supabase Storage).
 */
export function getTools() {
  return {
    // Example shape for future tools:
    // webSearch: webSearchTool,
  } satisfies Record<string, ReturnType<typeof tool>>;
}

// zod is re-exported by `ai`; keep a local import path stable for tool files.
export { z };
