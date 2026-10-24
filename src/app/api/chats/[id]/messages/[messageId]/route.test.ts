import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({ getCurrentUserId: vi.fn(async () => 'local-user') }));
vi.mock('@/lib/db', () => ({ isDbConfigured: true }));
vi.mock('@/lib/db/queries', () => ({
  getChat: vi.fn(),
  getMessage: vi.fn(),
  swapMessageWithVariant: vi.fn(),
  upsertMessage: vi.fn(),
}));

import { PATCH, POST } from './route';
import { getChat, getMessage, swapMessageWithVariant, upsertMessage } from '@/lib/db/queries';

/**
 * Issue #7: the message-level routes validate BOTH path ids as UUIDs
 * (previously skipped) and validate the variant payload before persisting.
 */

const CHAT_ID = '11111111-1111-4111-8111-111111111111';
const MESSAGE_ID = '22222222-2222-4222-8222-222222222222';

function url(chatId: string, messageId: string): string {
  return `http://localhost/api/chats/${chatId}/messages/${messageId}`;
}

function jsonRequest(method: 'PATCH' | 'POST', u: string, body: unknown): NextRequest {
  return new NextRequest(u, {
    method,
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getChat).mockResolvedValue({ id: CHAT_ID, userId: 'local-user' } as never);
  vi.mocked(getMessage).mockResolvedValue({
    id: MESSAGE_ID,
    chatId: CHAT_ID,
    userId: 'local-user',
    variants: null,
  } as never);
});

describe('message route path-id validation', () => {
  it.each([
    ['PATCH', '../escape', MESSAGE_ID],
    ['PATCH', CHAT_ID, 'not-a-uuid'],
    ['POST', 'dropping;--select', MESSAGE_ID],
    ['POST', CHAT_ID, 'zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz'],
  ] as const)('%s rejects bad ids (%s, %s)', async (method, chatId, messageId) => {
    const handler = method === 'PATCH' ? PATCH : POST;
    const res = await handler(jsonRequest(method, url(chatId, messageId), {}), {
      params: Promise.resolve({ id: chatId, messageId }),
    });
    expect(res.status).toBe(400);
    expect(swapMessageWithVariant).not.toHaveBeenCalled();
    expect(upsertMessage).not.toHaveBeenCalled();
  });
});

describe('PATCH variant switch', () => {
  it('rejects a missing or malformed selectVariantIndex', async () => {
    for (const body of [{}, { selectVariantIndex: 'zero' }, { selectVariantIndex: -2 }]) {
      const res = await PATCH(jsonRequest('PATCH', url(CHAT_ID, MESSAGE_ID), body), {
        params: Promise.resolve({ id: CHAT_ID, messageId: MESSAGE_ID }),
      });
      expect(res.status).toBe(400);
    }
    expect(swapMessageWithVariant).not.toHaveBeenCalled();
  });

  it('switches the variant for a valid request', async () => {
    vi.mocked(swapMessageWithVariant).mockResolvedValue([] as never);
    const res = await PATCH(
      jsonRequest('PATCH', url(CHAT_ID, MESSAGE_ID), { selectVariantIndex: 1 }),
      { params: Promise.resolve({ id: CHAT_ID, messageId: MESSAGE_ID }) },
    );
    expect(res.status).toBe(200);
    expect(swapMessageWithVariant).toHaveBeenCalledWith('local-user', MESSAGE_ID, 1);
  });
});

describe('POST variant append', () => {
  it('rejects a variant without parts before persisting', async () => {
    const res = await POST(
      jsonRequest('POST', url(CHAT_ID, MESSAGE_ID), { variant: { metadata: {} } }),
      { params: Promise.resolve({ id: CHAT_ID, messageId: MESSAGE_ID }) },
    );
    expect(res.status).toBe(400);
    expect(upsertMessage).not.toHaveBeenCalled();
  });

  it('appends a valid variant', async () => {
    const res = await POST(
      jsonRequest('POST', url(CHAT_ID, MESSAGE_ID), {
        variant: { parts: [{ type: 'text', text: 'old answer' }] },
      }),
      { params: Promise.resolve({ id: CHAT_ID, messageId: MESSAGE_ID }) },
    );
    expect(res.status).toBe(200);
    expect(upsertMessage).toHaveBeenCalledTimes(1);
  });
});
