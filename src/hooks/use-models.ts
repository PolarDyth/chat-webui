'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/client/api';
import type { OpenRouterModel } from '@/lib/types';

const CACHE_KEY = 'cw:v1:models';
const TTL_MS = 24 * 60 * 60 * 1000;

type Cache = { at: number; models: OpenRouterModel[] };

export function useModels() {
  const [models, setModels] = useState<OpenRouterModel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (raw) {
          const cache = JSON.parse(raw) as Cache;
          if (Date.now() - cache.at < TTL_MS && cache.models.length > 0) {
            if (!cancelled) {
              setModels(cache.models);
              setLoading(false);
            }
            return;
          }
        }
      } catch {
        // ignore corrupt cache
      }

      try {
        const res = await apiFetch('/api/models');
        if (!res.ok) throw new Error(`models ${res.status}`);
        const data = (await res.json()) as OpenRouterModel[];
        if (!cancelled) {
          setModels(data);
          localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), models: data }));
        }
      } catch {
        // leave models empty; picker shows an empty state
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { models, loading };
}
