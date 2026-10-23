import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const chats = pgTable('chats', {
  id: uuid('id').primaryKey(),
  userId: text('user_id').notNull(),
  title: text('title').notNull().default('New chat'),
  pinned: boolean('pinned').notNull().default(false),
  mode: text('mode').notNull().default('auto'),
  model: text('model'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey(),
    chatId: uuid('chat_id')
      .notNull()
      .references(() => chats.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    role: text('role').notNull(),
    /** UIMessage parts verbatim, so they round-trip with useChat. */
    parts: jsonb('parts').notNull(),
    metadata: jsonb('metadata'),
    /** Previous answers for the same question (regenerate / another model). */
    variants: jsonb('variants'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('messages_chat_id_created_at_idx').on(t.chatId, t.createdAt)],
);

export const settings = pgTable('settings', {
  userId: text('user_id').primaryKey(),
  apiKey: text('api_key'),
  defaultModel: text('default_model'),
  systemPrompt: text('system_prompt'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
