'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import { Database } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { ChatSidebar } from '@/components/chat/chat-sidebar';
import { ChatView } from '@/components/chat/chat-view';
import { useChats } from '@/hooks/use-chats';
import { useModels } from '@/hooks/use-models';
import { useSettings } from '@/hooks/use-settings';
import { readChatIdFromUrl, subscribeToChatUrl, writeChatIdToUrl } from '@/lib/chat-url';

const getServerChatId = () => null;

function DbNotConfiguredAlert() {
  return (
    <div className="p-4">
      <Alert>
        <Database className="size-4" />
        <AlertTitle>Database not configured</AlertTitle>
        <AlertDescription>
          No Postgres connection found. Paste your Supabase env block into{' '}
          <code className="font-mono text-xs">.env.local</code> (POSTGRES_URL, or the
          POSTGRES_HOST/USER/PASSWORD/DATABASE set), run{' '}
          <code className="font-mono text-xs">npx drizzle-kit push</code>, and restart the dev
          server. See the README for the two-minute setup.
        </AlertDescription>
      </Alert>
    </div>
  );
}

function WorkspaceLanding({ onNewChat }: { onNewChat: () => void }) {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="bg-card mx-auto max-w-md rounded-2xl border p-8 text-center shadow-sm">
        <h1 className="text-lg font-semibold">Your question workbench</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Every answer sits right under your question with the model that answered and exactly what
          the turn cost. Pick Auto, Free, or a specific model in the header.
        </p>
        <button
          type="button"
          onClick={onNewChat}
          className="bg-primary text-primary-foreground hover:bg-primary/90 mt-6 rounded-md px-4 py-2 text-sm font-medium transition-colors"
        >
          Start a chat
        </button>
      </div>
    </div>
  );
}

export function ChatWorkspace() {
  const { settings, dbNotConfigured: settingsDbError } = useSettings();
  const {
    chats,
    loading: chatsLoading,
    dbNotConfigured: chatsDbError,
    refresh,
    rename,
    adoptTitle,
    setPinned,
    remove,
  } = useChats();
  const { models, loading: modelsLoading } = useModels();
  // The URL is the source of truth for the open chat (see lib/chat-url).
  const activeChatId = useSyncExternalStore(
    subscribeToChatUrl,
    readChatIdFromUrl,
    getServerChatId,
  );
  // Unsent drafts by chat id, so switching chats doesn't lose a half-typed
  // question. A never-set state slot: stable identity, mutated in place.
  const [drafts] = useState(() => new Map<string, string>());

  const dbNotConfigured = settingsDbError || chatsDbError;

  const activeChat = useMemo(
    () => chats.find((c) => c.id === activeChatId) ?? null,
    [chats, activeChatId],
  );

  const newChat = () => writeChatIdToUrl(crypto.randomUUID());

  const selectChat = (id: string) => writeChatIdToUrl(id);

  return (
    <SidebarProvider>
      <ChatSidebar
        chats={chats}
        loading={chatsLoading}
        activeChatId={activeChatId}
        onSelectChat={selectChat}
        onNewChat={newChat}
        onRename={rename}
        onPin={setPinned}
        onDelete={(id) => {
          void remove(id);
          drafts.delete(id);
          // Replace, not push: back shouldn't land on a chat that no longer exists.
          if (id === activeChatId) writeChatIdToUrl(null, { replace: true });
        }}
      />
      <SidebarInset className="h-svh overflow-hidden">
        {dbNotConfigured ? (
          <DbNotConfiguredAlert />
        ) : activeChatId ? (
          <ChatView
            key={activeChatId}
            chat={
              activeChat ?? {
                id: activeChatId,
                title: 'New chat',
                pinned: false,
                mode: 'auto',
                model: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              }
            }
            settings={settings}
            models={models}
            modelsLoading={modelsLoading}
            onChatsChanged={refresh}
            adoptTitle={adoptTitle}
            drafts={drafts}
          />
        ) : (
          <WorkspaceLanding onNewChat={newChat} />
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}
