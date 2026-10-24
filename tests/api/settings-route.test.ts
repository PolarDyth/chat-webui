import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({ getCurrentUserId: vi.fn(async () => 'local-user') }));
vi.mock('@/lib/db', () => ({ isDbConfigured: true }));
vi.mock('@/lib/db/queries', () => ({
  getSettings: vi.fn(),
  upsertSettings: vi.fn(),
  updateSettingsApiKey: vi.fn(),
}));

import { GET, PUT } from '@/app/api/settings/route';
import { getSettings, upsertSettings } from '@/lib/db/queries';
import { decryptSecret, encryptSecret } from '@/lib/crypto';

/**
 * Issue #1: the settings API never returns the secret, and an empty key on
 * save keeps the stored one. Issue #2: a new key is persisted encrypted.
 */

process.env.SETTINGS_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString('base64');

const SECRET = 'sk-or-v1-abcd2f50';

function put(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/settings', {
    method: 'PUT',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/settings', () => {
  it('returns apiKeySet + a masked hint instead of the key', async () => {
    vi.mocked(getSettings).mockResolvedValue({
      userId: 'local-user',
      apiKey: encryptSecret(SECRET),
      defaultModel: 'google/gemini-2.0-flash',
      systemPrompt: 'Be brief.',
    } as never);
    const res = await GET();
    const json = (await res.json()) as Record<string, unknown>;
    expect(json).toEqual({
      apiKeySet: true,
      keyHint: '…2f50',
      defaultModel: 'google/gemini-2.0-flash',
      systemPrompt: 'Be brief.',
    });
    expect('apiKey' in json).toBe(false);
    expect(JSON.stringify(json)).not.toContain(SECRET);
  });

  it('reports no key when none is stored', async () => {
    vi.mocked(getSettings).mockResolvedValue(null as never);
    const res = await GET();
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.apiKeySet).toBe(false);
    expect(json.keyHint).toBeNull();
  });
});

describe('PUT /api/settings', () => {
  it('stores a new key encrypted — the plaintext never reaches the database', async () => {
    const res = await PUT(put({ apiKey: SECRET }));
    expect(res.status).toBe(200);
    const patch = vi.mocked(upsertSettings).mock.calls[0][1];
    expect(patch.apiKey).toMatch(/^v1:/);
    expect(decryptSecret(patch.apiKey!)).toBe(SECRET);
  });

  it('keeps the stored key when none is provided', async () => {
    await PUT(put({ defaultModel: 'x', systemPrompt: 'y' }));
    const patch = vi.mocked(upsertSettings).mock.calls[0][1];
    expect('apiKey' in patch).toBe(false);
    expect(patch.defaultModel).toBe('x');
    expect(patch.systemPrompt).toBe('y');
  });

  it('treats a whitespace key as "no change"', async () => {
    await PUT(put({ apiKey: '   ' }));
    const patch = vi.mocked(upsertSettings).mock.calls[0][1];
    expect('apiKey' in patch).toBe(false);
  });

  it('rejects malformed bodies with a 400', async () => {
    const res = await PUT(put({ apiKey: 12_345 }));
    expect(res.status).toBe(400);
    expect(upsertSettings).not.toHaveBeenCalled();
  });
});
