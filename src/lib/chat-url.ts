/**
 * The active chat lives in the URL as `/app?c=<uuid>` so a reload reopens it
 * and back/forward move between chats. Plain History API: Next.js integrates
 * native pushState/replaceState into its router, and nothing on the server
 * reads the param, so the app shell stays cacheable.
 */

const PARAM = 'c';
/** pushState/replaceState don't fire popstate, so programmatic writes notify through this. */
const CHANGE_EVENT = 'unwall:chat-url';

export function readChatIdFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get(PARAM);
}

export function subscribeToChatUrl(onChange: () => void): () => void {
  window.addEventListener('popstate', onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener('popstate', onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

export function writeChatIdToUrl(
  id: string | null,
  { replace = false }: { replace?: boolean } = {},
): void {
  if (readChatIdFromUrl() === id) return;
  const url = id ? `/app?${PARAM}=${encodeURIComponent(id)}` : '/app';
  if (replace) window.history.replaceState(null, '', url);
  else window.history.pushState(null, '', url);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
