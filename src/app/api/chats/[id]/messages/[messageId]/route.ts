import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUserId } from '@/lib/auth';
import { badRequest, dbNotConfigured, serverError, unauthorized } from '@/lib/api-utils';
import { isDbConfigured } from '@/lib/db';
import { getChat, getMessage, swapMessageWithVariant, upsertMessage } from '@/lib/db/queries';
import type { ChatMessageMetadata, MessageVariant } from '@/lib/types';
type RouteParams = { params: Promise<{ id: string; messageId: string }> };
/**
 * Branch navigation: persist a client-side variant switch. The chosen variant
 * becomes the message's current parts/metadata; the previous current answer is
 * pushed back into the variant list. Returns the resulting variant list.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    if (!isDbConfigured) return dbNotConfigured();
    const { id: chatId, messageId } = await params;
    const userId = await getCurrentUserId();
    const chat = await getChat(userId, chatId);
    if (!chat) return unauthorized();
    const message = await getMessage(userId, messageId);
    if (!message || message.chatId !== chatId) return unauthorized();
    const body = (await request.json()) as { selectVariantIndex?: number };
    if (typeof body.selectVariantIndex !== 'number') {
      return badRequest('selectVariantIndex is required');
    }
    const variants = await swapMessageWithVariant(userId, messageId, body.selectVariantIndex);
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
    const userId = await getCurrentUserId();
    const chat = await getChat(userId, chatId);
    if (!chat) return unauthorized();
    const message = await getMessage(userId, messageId);
    if (!message || message.chatId !== chatId) return unauthorized();
    const body = (await request.json()) as { variant: MessageVariant };
    const existing = (message.variants as MessageVariant[] | null) ?? [];
    const variants = [...existing, body.variant];
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
