import { beforeAll, describe, expect, it } from 'vitest';
import nextConfig from '../../next.config';

/**
 * Issue #8: hardening headers are set for every route from next.config.
 */

describe('next.config security headers', () => {
  const headers = nextConfig.headers ? nextConfig.headers() : [];
  let flat: Array<{ key: string; value: string }> = [];
  let source = '';

  beforeAll(async () => {
    const configs = await headers;
    flat = configs.flatMap((c) => c.headers as Array<{ key: string; value: string }>);
    source = configs[0]?.source ?? '';
  });

  const valueOf = (key: string) => flat.find((h) => h.key === key)?.value;

  it('applies to every route', () => {
    expect(source).toBe('/:path*');
  });

  it('sets the enforced hardening headers', () => {
    expect(valueOf('X-Frame-Options')).toBe('DENY');
    expect(valueOf('X-Content-Type-Options')).toBe('nosniff');
    expect(valueOf('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(valueOf('Permissions-Policy')).toContain('camera=()');
    expect(valueOf('Permissions-Policy')).toContain('microphone=()');
    expect(valueOf('Permissions-Policy')).toContain('geolocation=()');
  });

  it('ships a report-only CSP that forbids framing and off-origin defaults', () => {
    const csp = valueOf('Content-Security-Policy-Report-Only');
    expect(csp).toBeDefined();
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });

  it('never sets an enforcing CSP that could break the app silently', () => {
    expect(flat.some((h) => h.key === 'Content-Security-Policy')).toBe(false);
  });
});
