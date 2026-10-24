'use client';

import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { getSupabaseBrowserClient } from '@/lib/supabase/browser';

/**
 * Session state for the UI: the Supabase user (null when signed out), plus
 * `configured` so callers can distinguish "signed out" from "Supabase env
 * missing" instead of showing a login page that can't work.
 */
export function useUser() {
  const [user, setUser] = useState<User | null>(null);
  const [configured] = useState(() => Boolean(getSupabaseBrowserClient()));
  // Not configured → there is nothing to await, the hook is ready immediately.
  const [ready, setReady] = useState(() => !configured);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    let cancelled = false;
    void supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) {
        setUser(data.user ?? null);
        setReady(true);
      }
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setReady(true);
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  return { user, loading: !ready, configured };
}
