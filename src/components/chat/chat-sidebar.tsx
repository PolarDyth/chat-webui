'use client';

import { useState } from 'react';
import {
  MessageSquarePlus,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Search,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { ModeToggle } from '@/components/mode-toggle';
import { UserMenu } from '@/components/auth/user-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import type { ChatSummary } from '@/lib/types';

function ChatListItem({
  chat,
  active,
  onSelect,
  onRename,
  onPin,
  onDelete,
}: {
  chat: ChatSummary;
  active: boolean;
  onSelect: () => void;
  onRename: (title: string) => void;
  onPin: (pinned: boolean) => void;
  onDelete: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [draftTitle, setDraftTitle] = useState(chat.title);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const commitRename = () => {
    setRenaming(false);
    const next = draftTitle.trim();
    if (next && next !== chat.title) onRename(next);
    else setDraftTitle(chat.title);
  };

  return (
    <SidebarMenuItem>
      {renaming ? (
        <Input
          autoFocus
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename();
            if (e.key === 'Escape') {
              setDraftTitle(chat.title);
              setRenaming(false);
            }
          }}
          className="h-8"
        />
      ) : (
        <>
          <SidebarMenuButton asChild isActive={active}>
            <button type="button" onClick={onSelect} className="w-full text-left">
              <span className="truncate">{chat.title}</span>
            </button>
          </SidebarMenuButton>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuAction>
                <MoreHorizontal />
              </SidebarMenuAction>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="start">
              <DropdownMenuItem
                onSelect={() => {
                  setDraftTitle(chat.title);
                  setRenaming(true);
                }}
              >
                <Pencil /> Rename
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onPin(!chat.pinned)}>
                {chat.pinned ? <PinOff /> : <Pin />}
                {chat.pinned ? 'Unpin' : 'Pin'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirmingDelete(true)}>
                <Trash2 /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}

      <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{chat.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The whole thread and its cost history are removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setConfirmingDelete(false);
                onDelete();
                toast.success('Chat deleted');
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarMenuItem>
  );
}

export function ChatSidebar({
  chats,
  loading,
  activeChatId,
  onSelectChat,
  onNewChat,
  onRename,
  onPin,
  onDelete,
}: {
  chats: ChatSummary[];
  loading: boolean;
  activeChatId: string | null;
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
  onRename: (id: string, title: string) => void;
  onPin: (id: string, pinned: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  // On mobile the sidebar is a sheet: picking a chat or starting one must
  // close it so the conversation is visible. Desktop collapse is left alone.
  const { isMobile, setOpenMobile } = useSidebar();
  const chooseChat = (id: string) => {
    onSelectChat(id);
    if (isMobile) setOpenMobile(false);
  };
  const startChat = () => {
    onNewChat();
    if (isMobile) setOpenMobile(false);
  };
  const needle = query.trim().toLowerCase();
  const matches = (chat: ChatSummary) => !needle || chat.title.toLowerCase().includes(needle);
  const pinned = chats.filter((c) => c.pinned && matches(c));
  const rest = chats.filter((c) => !c.pinned && matches(c));

  return (
    <Sidebar>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={startChat} tooltip="New chat">
              <MessageSquarePlus />
              <span>New chat</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        {chats.length > 0 ? (
          <div className="relative">
            <Search
              aria-hidden
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2"
            />
            <SidebarInput
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setQuery('');
              }}
              placeholder="Search chats"
              aria-label="Search chats"
              className="pl-8"
            />
          </div>
        ) : null}
      </SidebarHeader>
      <SidebarContent>
        {loading ? (
          <SidebarGroup>
            <div className="space-y-2 px-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-7 w-full" />
              ))}
            </div>
          </SidebarGroup>
        ) : (
          <>
            {pinned.length > 0 && (
              <SidebarGroup>
                <SidebarGroupLabel>Pinned</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {pinned.map((chat) => (
                      <ChatListItem
                        key={chat.id}
                        chat={chat}
                        active={chat.id === activeChatId}
                        onSelect={() => chooseChat(chat.id)}
                        onRename={(title) => onRename(chat.id, title)}
                        onPin={(p) => onPin(chat.id, p)}
                        onDelete={() => onDelete(chat.id)}
                      />
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )}
            <SidebarGroup>
              {pinned.length > 0 && <SidebarGroupLabel>Recent</SidebarGroupLabel>}
              <SidebarGroupContent>
                <SidebarMenu>
                  {rest.length === 0 && pinned.length === 0 && (
                    <p className="text-muted-foreground px-3 py-4 text-xs">
                      {needle ? `No chats match “${query.trim()}”.` : 'No chats yet. Ask your first question.'}
                    </p>
                  )}
                  {rest.map((chat) => (
                    <ChatListItem
                      key={chat.id}
                      chat={chat}
                      active={chat.id === activeChatId}
                      onSelect={() => chooseChat(chat.id)}
                      onRename={(title) => onRename(chat.id, title)}
                      onPin={(p) => onPin(chat.id, p)}
                      onDelete={() => onDelete(chat.id)}
                    />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <UserMenu />
          </SidebarMenuItem>
          <SidebarMenuItem className="flex items-center justify-end">
            <ModeToggle />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
