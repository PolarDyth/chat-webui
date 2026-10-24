import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { badRequest } from '@/lib/api-utils';
import type { ChatMessageMetadata, ChatMode, ChatUIMessage, MessageVariant } from '@/lib/types';

/**
 * Request-boundary validation for every route body and path param. Shapes are
 * constrained to what the UI actually produces: roles and modes are enums,
 * message parts must be objects carrying a string `type`, and sizes are
 * bounded. Parts themselves pass through verbatim (the AI SDK owns their
 * shape); variant objects keep only the known top-level fields.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const uuidParam = z.string().regex(UUID_RE, 'Expected a UUID');

const CHAT_MODES: [ChatMode, ...ChatMode[]] = ['auto', 'free', 'manual'];
const chatModeSchema = z.enum(CHAT_MODES);

/** A UI message part: any object carrying a string `type` (text, file, data-*). */
const partSchema: z.ZodType<ChatUIMessage['parts'][number]> = z.custom<
  ChatUIMessage['parts'][number]
>((v) =>
  typeof v === 'object' && v !== null && !Array.isArray(v) &&
  typeof (v as { type?: unknown }).type === 'string',
);

const messageSchema: z.ZodType<Pick<ChatUIMessage, 'id' | 'role' | 'parts' | 'metadata'>> =
  z.object({
    id: z.string().min(1).max(128),
    role: z.enum(['user', 'assistant', 'system']),
    parts: z.array(partSchema).max(100),
    metadata: z.custom<ChatMessageMetadata | undefined>(
      (v) => v === undefined || (typeof v === 'object' && v !== null && !Array.isArray(v)),
    ).optional(),
  });

export const chatRequestSchema = z.object({
  id: uuidParam,
  messages: z.array(messageSchema).min(1).max(200),
  trigger: z.enum(['submit-message', 'regenerate-message']).optional(),
  messageId: z.string().max(128).optional(),
  mode: chatModeSchema.optional(),
  model: z.string().min(1).max(200).nullable().optional(),
});

export const chatPatchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  pinned: z.boolean().optional(),
  mode: chatModeSchema.optional(),
  model: z.string().min(1).max(200).nullable().optional(),
});

export const selectVariantIndexSchema = z.object({
  selectVariantIndex: z.number().int().min(0),
});

export const variantSchema: z.ZodType<MessageVariant> = z.object({
  parts: z.array(partSchema).max(200),
  metadata: z.custom<ChatMessageMetadata | undefined>(
    (v) => v === undefined || (typeof v === 'object' && v !== null && !Array.isArray(v)),
  ).optional(),
});

export const variantAppendSchema = z.object({ variant: variantSchema });

export const settingsPutSchema = z.object({
  apiKey: z.string().max(400).optional(),
  defaultModel: z.string().max(200).optional(),
  systemPrompt: z.string().max(8000).optional(),
});

type ParseResult<T> = { ok: true; data: T } | { ok: false; response: NextResponse };

export async function parseBody<S extends z.ZodType>(
  request: NextRequest,
  schema: S,
): Promise<ParseResult<z.output<S>>> {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return { ok: false, response: badRequest('Request body must be valid JSON') };
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue.path.length ? `${issue.path.join('.')}: ` : '';
    return { ok: false, response: badRequest(`${where}${issue.message}`) };
  }
  return { ok: true, data: parsed.data };
}
