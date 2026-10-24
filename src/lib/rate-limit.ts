import { NextResponse, type NextRequest } from 'next/server';

/**
 * Fixed-window in-memory rate limiter, keyed by client IP + bucket name.
 *
 * State lives in the server process: accurate for a single instance / long
 * running node server, per-instance on serverless platforms. For multi-instance
 * deployments add a shared store or a platform-level rate rule.
 */

const MAX_TRACKED_BUCKETS = 10_000;

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}

/** Returns a 429 response when over the limit, or null to proceed. */
export function rateLimit(
  request: NextRequest,
  bucketName: string,
  limit: number,
  windowMs: number,
): NextResponse | null {
  const now = Date.now();
  if (buckets.size > MAX_TRACKED_BUCKETS) {
    for (const [id, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(id);
    }
  }

  const id = `${bucketName}:${clientIp(request)}`;
  let bucket = buckets.get(id);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(id, bucket);
  }
  bucket.count += 1;

  if (bucket.count > limit) {
    const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    return NextResponse.json(
      { error: 'rate-limited', message: 'Too many requests — slow down and try again shortly.' },
      { status: 429, headers: { 'retry-after': String(retryAfterSec) } },
    );
  }
  return null;
}
