import { afterEach, describe, expect, it, vi } from 'vitest';

import { badRequest, dbNotConfigured, serverError, unauthorized } from '@/lib/api-utils';

/**
 * Issue #9: client-facing errors are generic — setup details, env var names,
 * and stack traces stay in the server log.
 */

afterEach(() => {
  vi.restoreAllMocks();
});

describe('dbNotConfigured', () => {
  it('returns a generic 503 without naming env vars or tooling', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = dbNotConfigured();
    expect(res.status).toBe(503);
    const json = (await res.json()) as { error: string; message: string };
    expect(json.error).toBe('db-not-configured');
    expect(json.message).toBe('Service temporarily unavailable — storage is not configured.');
    // Regression guard for #9: no internal names in the client response.
    const serialized = JSON.stringify(json);
    for (const internal of ['DATABASE_URL', 'POSTGRES_', 'drizzle', 'Supabase', 'supabase']) {
      expect(serialized).not.toContain(internal);
    }
  });

  it('logs the setup detail server-side', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    dbNotConfigured();
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('DATABASE_URL'));
  });
});

describe('serverError', () => {
  it('returns a generic 500 and never echoes the error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = serverError(new Error('connection to db.piqgxx.supabase.co failed'));
    expect(res.status).toBe(500);
    const json = (await res.json()) as { message: string };
    expect(JSON.stringify(json)).not.toContain('supabase');
    expect(JSON.stringify(json)).not.toContain('connection');
  });
});

describe('helpers', () => {
  it('badRequest carries the code and message', async () => {
    const res = badRequest('nope', 'missing-key');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'missing-key', message: 'nope' });
  });

  it('unauthorized hides existence behind a 404', () => {
    expect(unauthorized().status).toBe(404);
  });
});
