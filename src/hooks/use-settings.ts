'use client';

import { useCallback, useEffect, useState } from 'react';
import type { UserSettings } from '@/lib/types';

export function useSettings() {
  const [settings, setSettings] = useState<UserSettings>({
    apiKey: '',
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

  const save = useCallback(async (next: UserSettings) => {
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(next),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      throw new Error(body?.message ?? 'Failed to save settings');
    }
    setSettings(next);
  }, []);

  return { settings, setSettings, loaded, dbNotConfigured, save };
}
