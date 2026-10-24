'use client';

import { useCallback, useEffect, useState } from 'react';
import type { UserSettings } from '@/lib/types';

export function useSettings() {
  const [settings, setSettings] = useState<UserSettings>({
    apiKeySet: false,
    keyHint: null,
    defaultModel: '',
    systemPrompt: '',
  });
  const [loaded, setLoaded] = useState(false);
  const [dbNotConfigured, setDbNotConfigured] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/settings')
      .then(async (res) => {
        if (res.status === 503) {
          if (!cancelled) setDbNotConfigured(true);
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data && !cancelled) setSettings(data as UserSettings);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * `newApiKey` carries a key typed into the replace-only input; when absent,
   * the server keeps the stored key — the secret never round-trips.
   */
  const save = useCallback(async (next: UserSettings, newApiKey?: string) => {
    const key = newApiKey?.trim();
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        defaultModel: next.defaultModel,
        systemPrompt: next.systemPrompt,
        ...(key ? { apiKey: key } : {}),
      }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      throw new Error(body?.message ?? 'Failed to save settings');
    }
    setSettings(
      key
        ? { ...next, apiKeySet: true, keyHint: `…${key.slice(-4)}` }
        : next,
    );
  }, []);

  return { settings, setSettings, loaded, dbNotConfigured, save };
}
