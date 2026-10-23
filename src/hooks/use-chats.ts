'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ChatSummary } from '@/lib/types';

export function useChats() {
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [dbNotConfigured, setDbNotConfigured] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/chats');
      if (res.status === 503) {
        setDbNotConfigured(true);
        return;
      }
      if (res.ok) setChats((await res.json()) as ChatSummary[]);
    } catch {
      // keep previous list
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/chats');
        if (cancelled) return;
        if (res.status === 503) {
          setDbNotConfigured(true);
          return;
        }
        if (res.ok) setChats((await res.json()) as ChatSummary[]);
      } catch {
        // keep previous list
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const rename = useCallback(async (id: string, title: string) => {
    setChats((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)));
    await fetch(`/api/chats/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title }),
    });
  }, []);

  const setPinned = useCallback(async (id: string, pinned: boolean) => {
    setChats((prev) => prev.map((c) => (c.id === id ? { ...c, pinned } : c)));
    await fetch(`/api/chats/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pinned }),
    });
  }, []);

  const remove = useCallback(async (id: string) => {
    setChats((prev) => prev.filter((c) => c.id !== id));
    await fetch(`/api/chats/${id}`, { method: 'DELETE' });
  }, []);

  return { chats, loading, dbNotConfigured, refresh, rename, setPinned, remove };
}
