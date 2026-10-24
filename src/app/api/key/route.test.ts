import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({ getCurrentUserId: vi.fn(async () => 'local-user') }));
vi.mock('@/lib/db', () => ({ isDbConfigured: true }));
vi.mock('@/lib/server/api-key', () => ({
  getDecryptedApiKey: vi.fn(),
  keyHintFor: vi.fn((key: string) => `…${key.slice(-4)}`),
}));

import { GET } from './route';
import { getDecryptedApiKey } from '@/lib/server/api-key';

/**
 * Issue #1 follow-through: Verify validates the typed-in key or — with no
 * header — the stored key server-side, so the browser never needs the secret.
 */

const mockedGetDecrypted = vi.mocked(getDecryptedApiKey);

function keyGet(headerKey?: string): NextRequest {
  return new NextRequest('http://localhost/api/key', {
    headers: headerKey ? { 'x-openrouter-key': headerKey } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.OPENROUTER_API_KEY;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ data: { label: 'l', usage: { cost: 1 }, is_free_tier: true } })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GET /api/key', () => {
  it('validates the stored key when no header is sent', async () => {
    mockedGetDecrypted.mockResolvedValue('sk-or-v1-stored');
    const res = await GET(keyGet());
    expect(res.status).toBe(200);
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/key',
      expect.objectContaining({ headers: { Authorization: 'Bearer sk-or-v1-stored' } }),
    );
  });

  it('prefers the caller-supplied key over the stored one', async () => {
    process.env.OPENROUTER_API_KEY = 'sk-env';
    mockedGetDecrypted.mockResolvedValue('sk-or-v1-stored');
    await GET(keyGet('sk-typed'));
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/key',
      expect.objectContaining({ headers: { Authorization: 'Bearer sk-typed' } }),
    );
  });

  it('surfaces upstream rejection without echoing the key', async () => {
    mockedGetDecrypted.mockResolvedValue('sk-or-v1-stored');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 401 })),
    );
    const res = await GET(keyGet());
    expect(res.status).toBe(401);
    const json = (await res.json()) as { message: string };
    expect(json.message).not.toContain('sk-or-v1-stored');
  });

  it('returns a typed error when no key exists anywhere', async () => {
    mockedGetDecrypted.mockResolvedValue(null);
    const res = await GET(keyGet());
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('missing-key');
  });
});
