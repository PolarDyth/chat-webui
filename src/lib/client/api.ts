'use client';

/**
 * fetch wrapper for the app's own API routes. On 401 the session is gone —
 * send the user to /login (preserving where they were) instead of surfacing
 * raw auth errors from every hook. The Response is returned unchanged so
 * callers keep their existing handling.
 */
export async function apiFetch(
  input: string | URL | RequestInfo,
  init?: RequestInit,
): Promise<Response> {
  const res = await fetch(input, init);
  if (res.status === 401 && typeof window !== 'undefined') {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    // Full navigation, not router.push: this module sits outside React, and a
    // dead session must also clear every client cache keyed to it.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`/login?next=${next}`);
    // Hold the callers from acting on a doomed response; the navigation wins.
    await new Promise(() => undefined);
  }
  return res;
}
