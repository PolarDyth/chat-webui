import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUserId } from '@/lib/auth';
import { badRequest, dbNotConfigured, serverError, unauthorized } from '@/lib/api-utils';
import { isDbConfigured } from '@/lib/db';
import { getChat, getMessage, swapMessageWithVariant, upsertMessage } from '@/lib/db/queries';
import {
  parseBody,
  selectVariantIndexSchema,
  uuidParam,
  variantAppendSchema,
} from '@/lib/validation';
import type { ChatMessageMetadata, MessageVariant } from '@/lib/types';
type RouteParams = { params: Promise<{ id: string; messageId: string }> };

function invalidParams(chatId: string, messageId: string): NextResponse | null {
  if (!uuidParam.safeParse(chatId).success || !uuidParam.safeParse(messageId).success) {
    return badRequest('Invalid id');
  }
  return null;
}
/**
 * Branch navigation: persist a client-side variant switch. The chosen variant
 * becomes the message's current parts/metadata; the previous current answer is
 * pushed back into the variant list. Returns the resulting variant list.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    if (!isDbConfigured) return dbNotConfigured();
    const { id: chatId, messageId } = await params;
    const invalid = invalidParams(chatId, messageId);
    if (invalid) return invalid;
    const userId = await getCurrentUserId();
    const chat = await getChat(userId, chatId);
    if (!chat) return unauthorized();
    const message = await getMessage(userId, messageId);
    if (!message || message.chatId !== chatId) return unauthorized();
    const parsed = await parseBody(request, selectVariantIndexSchema);
    if (!parsed.ok) return parsed.response;
    const variants = await swapMessageWithVariant(userId, messageId, parsed.data.selectVariantIndex);
    if (!variants) return badRequest('Variant index out of range');
    return NextResponse.json({ ok: true, variants });
  } catch (error) {
    return serverError(error);
  }
}
/** Push an arbitrary historical answer into a message's variants (client-driven). */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    if (!isDbConfigured) return dbNotConfigured();
    const { id: chatId, messageId } = await params;
    const invalid = invalidParams(chatId, messageId);
    if (invalid) return invalid;
    const userId = await getCurrentUserId();
    const chat = await getChat(userId, chatId);
    if (!chat) return unauthorized();
    const message = await getMessage(userId, messageId);
    if (!message || message.chatId !== chatId) return unauthorized();
    const parsed = await parseBody(request, variantAppendSchema);
    if (!parsed.ok) return parsed.response;
    const existing = (message.variants as MessageVariant[] | null) ?? [];
    const variants = [...existing, parsed.data.variant];
    await upsertMessage(userId, {
      id: messageId,
      chatId,
      role: 'assistant',
      parts: message.parts,
      metadata: (message.metadata as ChatMessageMetadata) ?? undefined,
      variants,
    });
    return NextResponse.json({ ok: true, variants });
  } catch (error) {
    return serverError(error);
  }
}
