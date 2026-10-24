import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({ getCurrentUserId: vi.fn(async () => 'local-user') }));
vi.mock('@/lib/db', () => ({ isDbConfigured: true }));
vi.mock('@/lib/db/queries', () => ({
  createChat: vi.fn(),
  deleteMessagesAfter: vi.fn(),
  getChat: vi.fn(),
  getMessage: vi.fn(),
  getSettings: vi.fn(),
  touchChat: vi.fn(),
  updateChat: vi.fn(),
  upsertMessage: vi.fn(),
}));
vi.mock('@/lib/server/api-key', () => ({
  getDecryptedApiKey: vi.fn(),
  keyHintFor: vi.fn((key: string) => `…${key.slice(-4)}`),
}));

import { POST } from '@/app/api/chat/route';
import { getChat } from '@/lib/db/queries';
import { getDecryptedApiKey } from '@/lib/server/api-key';

/**
 * Guards on the billing streaming route: request validation (#7), the per-IP
 * rate limit (#6), and the missing-key check — none of which may reach the
 * provider or the database writes.
 */

const UUID = 'd6b3f3a6-9d47-4b6a-9a2e-5b8f1c7d1234';

function chatPost(ip: string, body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/chat', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
  });
}

const validBody = {
  id: UUID,
  messages: [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hi' }] }],
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.OPENROUTER_API_KEY = 'sk-test-fallback';
});

afterEach(() => {
  delete process.env.OPENROUTER_API_KEY;
});

describe('POST /api/chat guard rails', () => {
  it('rejects malformed JSON with a 400', async () => {
    const res = await POST(chatPost('192.0.2.1', '{oops'));
    expect(res.status).toBe(400);
  });

  it('rejects an empty message list with a 400', async () => {
    const res = await POST(chatPost('192.0.2.2', { id: UUID, messages: [] }));
    expect(res.status).toBe(400);
  });

  it('rejects a non-UUID chat id with a 400', async () => {
    const res = await POST(
      chatPost('192.0.2.3', { ...validBody, id: '../../etc/passwd' }),
    );
    expect(res.status).toBe(400);
  });

  it('returns a typed missing-key error when no key is configured', async () => {
    delete process.env.OPENROUTER_API_KEY;
    vi.mocked(getDecryptedApiKey).mockResolvedValue(null);
    const res = await POST(chatPost('192.0.2.4', validBody));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('missing-key');
  });

  it('falls back to the decrypted stored key when env has none', async () => {
    delete process.env.OPENROUTER_API_KEY;
    vi.mocked(getDecryptedApiKey).mockResolvedValue('sk-stored');
    // getChat returns null twice → ownership check fails with 404, but the
    // fact we got PAST the missing-key check proves the stored key was found.
    vi.mocked(getChat).mockResolvedValue(null as never);
    const res = await POST(chatPost('192.0.2.5', validBody));
    expect(res.status).toBe(404);
    expect(getDecryptedApiKey).toHaveBeenCalledWith('local-user');
  });

  it('rate limits the 11th request in a minute from one IP', async () => {
    vi.mocked(getDecryptedApiKey).mockResolvedValue('sk-stored');
    vi.mocked(getChat).mockResolvedValue(null as never);
    const codes: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await POST(chatPost('192.0.2.6', validBody));
      codes.push(res.status);
    }
    expect(codes.slice(0, 10).every((c) => c !== 429)).toBe(true);
    expect(codes[10]).toBe(429);
  });

  it('does not count a different IP against the limited one', async () => {
    vi.mocked(getDecryptedApiKey).mockResolvedValue('sk-stored');
    vi.mocked(getChat).mockResolvedValue(null as never);
    const res = await POST(chatPost('192.0.2.99', validBody));
    expect(res.status).not.toBe(429);
  });
});
