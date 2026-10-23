import { NextResponse, type NextRequest } from 'next/server';
import { serverError } from '@/lib/api-utils';
import { badRequest } from '@/lib/api-utils';
/** Validate an OpenRouter key and surface remaining credits. */
export async function GET(request: NextRequest) {
  try {
    const key =
      request.headers.get('x-openrouter-key')?.trim() || process.env.OPENROUTER_API_KEY?.trim();
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
