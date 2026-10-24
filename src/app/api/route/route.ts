import type { NextRequest } from 'next/server';
import { connection } from 'next/server';
import { getCurrentUserId } from '@/lib/auth';
import { badRequest, dbNotConfigured, serverError, unauthenticated } from '@/lib/api-utils';
import { isDbConfigured } from '@/lib/db';
import { getSettings } from '@/lib/db/queries';
import { getDecryptedApiKey } from '@/lib/server/api-key';
import { rateLimit } from '@/lib/rate-limit';
import { parseBody, routeRequestSchema } from '@/lib/validation';
import { routeAuto } from '@/lib/ai/router/classify';

/**
 * Standalone Smart Auto classification: POST { prompt } → the routing decision
 * plus the shortlist it chose from. Tuning surface for the classifier — try
 * prompt shapes with curl without sending a full chat turn.
 */
export async function POST(request: NextRequest) {
  try {
    if (!isDbConfigured) return dbNotConfigured();

    const limited = rateLimit(request, 'route', 20, 60_000);
    if (limited) return limited;
    await connection();

    const parsed = await parseBody(request, routeRequestSchema);
    if (!parsed.ok) return parsed.response;

    const userId = await getCurrentUserId();
    if (!userId) return unauthenticated();

    const storedKey = await getDecryptedApiKey(userId);
    const apiKey = storedKey?.trim() || process.env.OPENROUTER_API_KEY?.trim();
    if (!apiKey) return badRequest('Add your OpenRouter API key in Settings first.', 'missing-key');

    const decision = await routeAuto({
      apiKey,
      latestUserText: parsed.data.prompt,
      digest: '',
      routerModel: (await getSettings(userId))?.routerModel,
      freeOnly: parsed.data.freeOnly ?? false,
    });
    // routed:false is a valid outcome here (timeout, empty shortlist…) — the
    // point of the endpoint is seeing exactly that.
    if (!decision) return Response.json({ routed: false });

    return Response.json({ routed: true, ...decision });
  } catch (error) {
    return serverError(error);
  }
}
