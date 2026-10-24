import { NextResponse, type NextRequest } from 'next/server';
import { serverError } from '@/lib/api-utils';
import { badRequest } from '@/lib/api-utils';
import { rateLimit } from '@/lib/rate-limit';
import { getCurrentUserId } from '@/lib/auth';
import { isDbConfigured } from '@/lib/db';
import { getDecryptedApiKey } from '@/lib/server/api-key';

/** Per-IP cap: this route relays a caller-supplied token upstream, so it must
 *  not be usable as a free OpenRouter relay or a key-validity oracle. */
const KEY_CHECK_LIMIT = 30;
const KEY_CHECK_WINDOW_MS = 60_000;

/** Validate an OpenRouter key and surface remaining credits. */
export async function GET(request: NextRequest) {
  try {
    const limited = rateLimit(request, 'key-check', KEY_CHECK_LIMIT, KEY_CHECK_WINDOW_MS);
    if (limited) return limited;

    // A typed-in key (replace flow) is validated as-is; otherwise fall back to
    // the stored key, then to the env key.
    let key = request.headers.get('x-openrouter-key')?.trim() || undefined;
    if (!key && isDbConfigured) {
      const userId = await getCurrentUserId();
      key = (await getDecryptedApiKey(userId)) ?? undefined;
    }
    key = key || process.env.OPENROUTER_API_KEY?.trim();
    if (!key) return badRequest('No OpenRouter API key provided', 'missing-key');
    const res = await fetch('https://openrouter.ai/api/v1/key', {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: 'invalid-key', message: `OpenRouter rejected the key (HTTP ${res.status})` },
        { status: 401 },
      );
    }
    const json = (await res.json()) as { data?: Record<string, unknown> };
    const data = json.data ?? {};
    const usage = (data.usage as Record<string, unknown> | undefined) ?? {};
    const limit = (data.limit as Record<string, unknown> | undefined) ?? {};
    return NextResponse.json({
      label: data.label ?? null,
      usage: usage.cost ?? usage.usage ?? null,
      limit: limit.limit ?? null,
      isFreeTier: Boolean(data.is_free_tier),
    });
  } catch (error) {
    return serverError(error);
  }
}
