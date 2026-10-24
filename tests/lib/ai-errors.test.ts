import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeUpstreamError } from '@/lib/ai/errors';
import { isRetryableModelError } from '@/lib/ai';

/**
 * Issue #9: provider error text is mapped to short generic messages before it
 * reaches the client stream. The mapped text MUST keep the HTTP status, and
 * retryable statuses MUST still classify as retryable — the fallback chain
 * depends on `isRetryableModelError(describeUpstreamError(e))`.
 */

afterEach(() => {
  vi.restoreAllMocks();
});

function silenceLogging() {
  vi.spyOn(console, 'error').mockImplementation(() => {});
}

describe('describeUpstreamError', () => {
  it('returns null for no error', () => {
    expect(describeUpstreamError(null)).toBeNull();
  });

  it.each([
    [402, 'lacks credits'],
    [429, 'rate-limited'],
    [500, 'temporary error'],
    [503, 'temporary error'],
    [529, 'temporary error'],
  ] as const)('keeps HTTP %i retryable', (status, fragment) => {
    silenceLogging();
    const text = describeUpstreamError({ statusCode: status, message: 'raw provider body' })!;
    expect(text).toContain(String(status));
    expect(text).toContain(fragment);
    expect(isRetryableModelError(text)).toBe(true);
    // The raw provider body must not leak into the mapped message.
    expect(text).not.toContain('raw provider body');
  });

  it.each([
    [401, 'rejected the API key'],
    [403, 'rejected the API key'],
    [404, 'unavailable'],
  ] as const)('keeps HTTP %i non-retryable', (status, fragment) => {
    silenceLogging();
    const text = describeUpstreamError({ statusCode: status, message: 'raw provider body' })!;
    expect(text).toContain(String(status));
    expect(text).toContain(fragment);
    expect(isRetryableModelError(text)).toBe(false);
  });

  it('reads responseStatusCode when statusCode is absent', () => {
    silenceLogging();
    const text = describeUpstreamError({ responseStatusCode: 502 })!;
    expect(text).toContain('502');
    expect(isRetryableModelError(text)).toBe(true);
  });

  it('classifies status-less errors by their message', () => {
    silenceLogging();
    const retryable = describeUpstreamError(new Error('too many requests, slow down'))!;
    expect(isRetryableModelError(retryable)).toBe(true);
    expect(retryable).not.toContain('too many requests');

    const fatal = describeUpstreamError(new Error('socket hang up'))!;
    expect(fatal).toBe('The model request failed.');
    expect(isRetryableModelError(fatal)).toBe(false);
  });

  it('never includes the original error message for unknown statuses', () => {
    silenceLogging();
    const text = describeUpstreamError({ statusCode: 418, message: "I'm a teapot body" })!;
    expect(text).toContain('418');
    expect(text).not.toContain('teapot body');
  });

  it('logs the full error server-side', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const original = { statusCode: 429, message: 'secret-ish detail' };
    describeUpstreamError(original);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('upstream provider error'), original);
  });
});
