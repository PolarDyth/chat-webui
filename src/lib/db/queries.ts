import { and, asc, desc, eq, gt } from 'drizzle-orm';
import { getDb } from './index';
import { chats, messages, settings } from './schema';
import type { ChatMessageMetadata, ChatMode, MessageVariant } from '@/lib/types';

/**
 * Every function here is scoped by userId and verifies ownership before
 * touching data. Route handlers must call getCurrentUserId() and pass it in.
 */

export async function getSettings(userId: string) {
  const [row] = await getDb()
    .select()
    .from(settings)
    .where(eq(settings.userId, userId))
    .limit(1);
  return row ?? null;
}

export async function upsertSettings(
  userId: string,
  patch: { apiKey?: string | null; defaultModel?: string | null; systemPrompt?: string | null },
) {
  await getDb()
    .insert(settings)
    .values({ userId, ...patch, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settings.userId,
      set: { ...patch, updatedAt: new Date() },
    });
}

export async function listChats(userId: string) {
  return getDb()
    .select()
    .from(chats)
    .where(eq(chats.userId, userId))
    .orderBy(desc(chats.pinned), desc(chats.updatedAt));
}

export async function getChat(userId: string, chatId: string) {
  const [row] = await getDb()
    .select()
    .from(chats)
    .where(and(eq(chats.id, chatId), eq(chats.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function createChat(
  userId: string,
  chat: { id: string; title?: string; mode?: ChatMode; model?: string | null },
) {
  await getDb().insert(chats).values({
    id: chat.id,
    userId,
    title: chat.title ?? 'New chat',
    mode: chat.mode ?? 'auto',
    model: chat.model ?? null,
  });
}

export async function updateChat(
  userId: string,
  chatId: string,
  patch: { title?: string; pinned?: boolean; mode?: ChatMode; model?: string | null },
) {
  await getDb()
    .update(chats)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(chats.id, chatId), eq(chats.userId, userId)));
}

export async function touchChat(userId: string, chatId: string) {
  await getDb()
    .update(chats)
    .set({ updatedAt: new Date() })
    .where(and(eq(chats.id, chatId), eq(chats.userId, userId)));
}

export async function deleteChat(userId: string, chatId: string) {
  await getDb().delete(chats).where(and(eq(chats.id, chatId), eq(chats.userId, userId)));
}

/** Mid-conversation regenerate: drop rows that came after the regenerated answer. */
export async function deleteMessagesAfter(
  userId: string,
  chatId: string,
  messageId: string,
): Promise<void> {
  const target = await getMessage(userId, messageId);
  if (!target) return;
  await getDb()
    .delete(messages)
    .where(
      and(
        eq(messages.chatId, chatId),
        eq(messages.userId, userId),
        gt(messages.createdAt, target.createdAt),
      ),
    );
}

export async function getMessages(userId: string, chatId: string) {
  return getDb()
    .select()
    .from(messages)
    .where(and(eq(messages.chatId, chatId), eq(messages.userId, userId)))
    .orderBy(asc(messages.createdAt));
}

export async function getMessage(userId: string, messageId: string) {
  const [row] = await getDb()
    .select()
    .from(messages)
    .where(and(eq(messages.id, messageId), eq(messages.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function upsertMessage(
  userId: string,
  message: {
    id: string;
    chatId: string;
    role: 'user' | 'assistant';
    parts: unknown;
    metadata?: ChatMessageMetadata | null;
    variants?: MessageVariant[] | null;
  },
) {
  await getDb()
    .insert(messages)
    .values({
      id: message.id,
      chatId: message.chatId,
      userId,
      role: message.role,
      parts: message.parts as object,
      metadata: message.metadata ?? null,
      variants: message.variants ?? null,
    })
    .onConflictDoUpdate({
      target: messages.id,
      set: {
        parts: message.parts as object,
        metadata: message.metadata ?? null,
        variants: message.variants ?? null,
      },
    });
}

/** Swap the current answer with a stored variant (branch navigation). */
export async function swapMessageWithVariant(
  userId: string,
  messageId: string,
  variantIndex: number,
): Promise<MessageVariant[] | null> {
  const row = await getMessage(userId, messageId);
  if (!row) return null;
  const variants = (row.variants as MessageVariant[] | null) ?? [];
  if (variantIndex < 0 || variantIndex >= variants.length) return null;
  const chosen = variants[variantIndex];
  const nextVariants: MessageVariant[] = [
    ...variants.filter((_, i) => i !== variantIndex),
    { parts: row.parts as MessageVariant['parts'], metadata: (row.metadata as ChatMessageMetadata) ?? undefined },
  ];
  await getDb()
    .update(messages)
    .set({ parts: chosen.parts as object, metadata: chosen.metadata ?? null, variants: nextVariants })
    .where(and(eq(messages.id, messageId), eq(messages.userId, userId)));
  return nextVariants;
}
