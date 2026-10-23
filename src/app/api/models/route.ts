import { NextResponse, connection } from 'next/server';
import { mapOpenRouterModels, OPENROUTER_MODELS_URL } from '@/lib/ai';
import { serverError } from '@/lib/api-utils';

/** Public OpenRouter catalog, proxied to dodge CORS; upstream cached for an hour. */
export async function GET() {
  try {
    // Request-time route: a build-time OpenRouter outage must not freeze a 502 here.
    await connection();
    const res = await fetch(OPENROUTER_MODELS_URL, { next: { revalidate: 3600 } });
    if (!res.ok) {
      return NextResponse.json(
        { error: 'upstream', message: `OpenRouter returned ${res.status}` },
        { status: 502 },
      );
    }
    const json = (await res.json()) as { data?: Array<Record<string, unknown>> };
    return NextResponse.json(mapOpenRouterModels(json));
  } catch (error) {
    return serverError(error);
  }
}
