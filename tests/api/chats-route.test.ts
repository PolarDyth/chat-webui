import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({ getCurrentUserId: vi.fn(async () => 'local-user') }));
vi.mock('@/lib/db', () => ({ isDbConfigured: true }));
vi.mock('@/lib/db/queries', () => ({
  deleteChat: vi.fn(),
  getChat: vi.fn(),
  getMessages: vi.fn(),
  updateChat: vi.fn(),
}));

import { PATCH } from '@/app/api/chats/[id]/route';
import { getChat, updateChat } from '@/lib/db/queries';

/**
 * Issue #7: chat patches are zod-validated — unknown modes and malformed
 * fields are a 400 before anything touches the database.
 */

const UUID = 'd6b3f3a6-9d47-4b6a-9a2e-5b8f1c7d1234';

function patch(id: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/chats/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getChat).mockResolvedValue({ id: UUID, userId: 'local-user' } as never);
});

describe('PATCH /api/chats/[id]', () => {
  it('rejects non-UUID ids', async () => {
    const res = await PATCH(patch('../escape', { pinned: true }), {
      params: Promise.resolve({ id: '../escape' }),
    });
    expect(res.status).toBe(400);
    expect(updateChat).not.toHaveBeenCalled();
  });

  it('rejects unknown modes before the database is touched', async () => {
    const res = await PATCH(patch(UUID, { mode: 'turbo' }), {
      params: Promise.resolve({ id: UUID }),
    });
    expect(res.status).toBe(400);
    expect(updateChat).not.toHaveBeenCalled();
  });

  it('rejects malformed fields (non-boolean pin, oversized title)', async () => {
    expect(
      (await PATCH(patch(UUID, { pinned: 'yes' }), { params: Promise.resolve({ id: UUID }) }))
        .status,
    ).toBe(400);
    expect(
      (await PATCH(patch(UUID, { title: 'x'.repeat(201) }), {
        params: Promise.resolve({ id: UUID }),
      })).status,
    ).toBe(400);
    expect(updateChat).not.toHaveBeenCalled();
  });

  it('applies a valid patch', async () => {
    const res = await PATCH(patch(UUID, { pinned: true, mode: 'manual', model: 'x/y' }), {
      params: Promise.resolve({ id: UUID }),
    });
    expect(res.status).toBe(200);
    expect(updateChat).toHaveBeenCalledWith('local-user', UUID, {
      pinned: true,
      mode: 'manual',
      model: 'x/y',
    });
  });
});
