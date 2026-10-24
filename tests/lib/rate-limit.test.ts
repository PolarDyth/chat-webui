import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';

/**
 * Issue #6: per-IP fixed-window rate limits guard the expensive routes.
 */

function req(ip: string): NextRequest {
  return new NextRequest('http://localhost/api/test', {
    headers: { 'x-forwarded-for': ip },
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('rateLimit', () => {
  it('allows requests up to the limit and returns a 429 with retry-after after it', () => {
    for (let i = 0; i < 5; i++) {
      expect(rateLimit(req('10.0.0.1'), 'unit', 5, 60_000)).toBeNull();
    }
    const limited = rateLimit(req('10.0.0.1'), 'unit', 5, 60_000);
    expect(limited).not.toBeNull();
    expect(limited!.status).toBe(429);
    const retryAfter = Number(limited!.headers.get('retry-after'));
    expect(retryAfter).toBeGreaterThanOrEqual(1);
    expect(retryAfter).toBeLessThanOrEqual(60);
  });

  it('resets after the window passes', () => {
    for (let i = 0; i < 3; i++) rateLimit(req('10.0.0.2'), 'window', 3, 60_000);
    expect(rateLimit(req('10.0.0.2'), 'window', 3, 60_000)).not.toBeNull();
    vi.setSystemTime(1_000_000 + 60_001);
    expect(rateLimit(req('10.0.0.2'), 'window', 3, 60_000)).toBeNull();
  });

  it('tracks client IPs independently', () => {
    for (let i = 0; i < 3; i++) rateLimit(req('10.0.0.3'), 'iso', 3, 60_000);
    expect(rateLimit(req('10.0.0.3'), 'iso', 3, 60_000)).not.toBeNull();
    expect(rateLimit(req('10.0.0.4'), 'iso', 3, 60_000)).toBeNull();
  });

  it('tracks bucket names independently', () => {
    for (let i = 0; i < 3; i++) rateLimit(req('10.0.0.5'), 'chat', 3, 60_000);
    expect(rateLimit(req('10.0.0.5'), 'chat', 3, 60_000)).not.toBeNull();
    expect(rateLimit(req('10.0.0.5'), 'models', 3, 60_000)).toBeNull();
  });

  it('falls back from x-forwarded-for to x-real-ip, then to a shared unknown bucket', () => {
    const realIp = new NextRequest('http://localhost/api/test', {
      headers: { 'x-real-ip': '10.9.9.9' },
    });
    const noIp = new NextRequest('http://localhost/api/test');
    expect(rateLimit(realIp, 'fb', 1, 60_000)).toBeNull();
    expect(rateLimit(realIp, 'fb', 1, 60_000)).not.toBeNull();
    expect(rateLimit(noIp, 'fb', 1, 60_000)).toBeNull();
    expect(rateLimit(noIp, 'fb', 1, 60_000)).not.toBeNull();
  });

  it('uses the first hop of a proxy chain in x-forwarded-for', () => {
    const a = new NextRequest('http://localhost/api/test', {
      headers: { 'x-forwarded-for': '10.1.1.1, 10.1.1.2' },
    });
    const b = new NextRequest('http://localhost/api/test', {
      headers: { 'x-forwarded-for': '10.1.1.2, 10.1.1.3' },
    });
    expect(rateLimit(a, 'hop', 1, 60_000)).toBeNull();
    expect(rateLimit(a, 'hop', 1, 60_000)).not.toBeNull();
    expect(rateLimit(b, 'hop', 1, 60_000)).toBeNull();
  });
});
