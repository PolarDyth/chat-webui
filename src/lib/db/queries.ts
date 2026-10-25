import { and, asc, desc, eq, gt, sql } from 'drizzle-orm';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import type { PostgresJsQueryResultHKT } from 'drizzle-orm/postgres-js';
import { getDb } from './index';
import { chats, messages, settings } from './schema';
import type * as schema from './schema';
import type { ChatMessageMetadata, ChatMode, MessageVariant } from '@/lib/types';

/**
 * Every function here is scoped by userId and verifies ownership before
 * touching data. Route handlers must call getCurrentUserId() and pass it in.
 */

type ScopedTx = PgTransaction<
  PostgresJsQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

/**
 * Runs the queries as the row-level-security-enforced `authenticated` role
 * with the caller's JWT claims set, so the `auth.uid()` policies genuinely
 * apply — the pool connects as the table owner, which would otherwise bypass
 * RLS entirely. Both `SET LOCAL` and `set_config(..., true)` are
 * transaction-scoped, so nothing leaks back into the pooled connection.
 */
async function withUserScope<T>(userId: string, fn: (tx: ScopedTx) => Promise<T>): Promise<T> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL ROLE authenticated`);
    await tx.execute(
      sql`SELECT set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: 'authenticated' })}, true)`,
    );
    return fn(tx);
  });
}

export async function getSettings(userId: string) {
  return withUserScope(userId, async (tx) => {
    const [row] = await tx.select().from(settings).where(eq(settings.userId, userId)).limit(1);
    return row ?? null;
  });
}

/**
 * Omitted fields (undefined) keep the stored value — only provided fields
 * change. apiKey must arrive already encrypted (see lib/server/api-key.ts).
 */
export async function upsertSettings(
  userId: string,
  patch: {
    apiKey?: string | null;
    defaultModel?: string | null;
    systemPrompt?: string | null;
    routerModel?: string | null;
    routerFreeOnly?: boolean;
  },
) {
  const set: Partial<typeof settings.$inferInsert> = { updatedAt: new Date() };
  if (patch.apiKey !== undefined) set.apiKey = patch.apiKey;
  if (patch.defaultModel !== undefined) set.defaultModel = patch.defaultModel;
  if (patch.systemPrompt !== undefined) set.systemPrompt = patch.systemPrompt;
  if (patch.routerModel !== undefined) set.routerModel = patch.routerModel;
  if (patch.routerFreeOnly !== undefined) set.routerFreeOnly = patch.routerFreeOnly;
  await withUserScope(userId, async (tx) => {
    await tx
      .insert(settings)
      .values({ userId, ...set })
      .onConflictDoUpdate({
        target: settings.userId,
        set,
      });
  });
}

export async function updateSettingsApiKey(userId: string, storedValue: string) {
  await withUserScope(userId, async (tx) => {
    await tx
      .insert(settings)
      .values({ userId, apiKey: storedValue, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: settings.userId,
        set: { apiKey: storedValue, updatedAt: new Date() },
      });
  });
}

export async function listChats(userId: string) {
  return withUserScope(userId, (tx) =>
    tx
      .select()
      .from(chats)
      .where(eq(chats.userId, userId))
      .orderBy(desc(chats.pinned), desc(chats.updatedAt)),
  );
}

export async function getChat(userId: string, chatId: string) {
  return withUserScope(userId, async (tx) => {
    const [row] = await tx
      .select()
      .from(chats)
      .where(and(eq(chats.id, chatId), eq(chats.userId, userId)))
      .limit(1);
    return row ?? null;
  });
}

export async function createChat(
  userId: string,
  chat: { id: string; title?: string; mode?: ChatMode; model?: string | null },
) {
  await withUserScope(userId, async (tx) => {
    await tx.insert(chats).values({
      id: chat.id,
      userId,
      title: chat.title ?? 'New chat',
      mode: chat.mode ?? 'auto',
      model: chat.model ?? null,
    });
  });
}

export async function updateChat(
  userId: string,
  chatId: string,
  patch: { title?: string; pinned?: boolean; mode?: ChatMode; model?: string | null; routedModel?: string | null },
) {
  await withUserScope(userId, async (tx) => {
    await tx
      .update(chats)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(chats.id, chatId), eq(chats.userId, userId)));
  });
}

export async function touchChat(userId: string, chatId: string) {
  await withUserScope(userId, async (tx) => {
    await tx
      .update(chats)
      .set({ updatedAt: new Date() })
      .where(and(eq(chats.id, chatId), eq(chats.userId, userId)));
  });
}

export async function deleteChat(userId: string, chatId: string) {
  await withUserScope(userId, async (tx) => {
    await tx.delete(chats).where(and(eq(chats.id, chatId), eq(chats.userId, userId)));
  });
}

/**
 * Regenerate / edit-resend: drop rows that came after the given message.
 * The cutoff is compared inside Postgres. Round-tripping created_at through a
 * JS Date truncates to milliseconds, and the target row's own microsecond
 * timestamp then compares greater than that cutoff — deleting the target too.
 */
export async function deleteMessagesAfter(
  userId: string,
  chatId: string,
  messageId: string,
): Promise<void> {
  await withUserScope(userId, async (tx) => {
    await tx
      .delete(messages)
      .where(
        and(
          eq(messages.chatId, chatId),
          eq(messages.userId, userId),
          gt(
            messages.createdAt,
            sql`(select ${messages.createdAt} from ${messages} where ${messages.id} = ${messageId} and ${messages.userId} = ${userId})`,
          ),
        ),
      );
  });
}

export async function getMessages(userId: string, chatId: string) {
  return withUserScope(userId, (tx) =>
    tx
      .select()
      .from(messages)
      .where(and(eq(messages.chatId, chatId), eq(messages.userId, userId)))
      .orderBy(asc(messages.createdAt)),
  );
}

export async function getMessage(userId: string, messageId: string) {
  return withUserScope(userId, async (tx) => {
    const [row] = await tx
      .select()
      .from(messages)
      .where(and(eq(messages.id, messageId), eq(messages.userId, userId)))
      .limit(1);
    return row ?? null;
  });
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
  await withUserScope(userId, async (tx) => {
    await tx
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
  });
}

/** Swap the current answer with a stored variant (branch navigation). */
export async function swapMessageWithVariant(
  userId: string,
  messageId: string,
  variantIndex: number,
): Promise<MessageVariant[] | null> {
  return withUserScope(userId, async (tx) => {
    const [row] = await tx
      .select()
      .from(messages)
      .where(and(eq(messages.id, messageId), eq(messages.userId, userId)))
      .limit(1);
    if (!row) return null;
    const variants = (row.variants as MessageVariant[] | null) ?? [];
    if (variantIndex < 0 || variantIndex >= variants.length) return null;
    const chosen = variants[variantIndex];
    const nextVariants: MessageVariant[] = [
      ...variants.filter((_, i) => i !== variantIndex),
      {
        parts: row.parts as MessageVariant['parts'],
        metadata: (row.metadata as ChatMessageMetadata) ?? undefined,
      },
    ];
    await tx
      .update(messages)
      .set({
        parts: chosen.parts as object,
        metadata: chosen.metadata ?? null,
        variants: nextVariants,
      })
      .where(and(eq(messages.id, messageId), eq(messages.userId, userId)));
    return nextVariants;
  });
}
