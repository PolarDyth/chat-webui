import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUserId } from '@/lib/auth';
import { badRequest, dbNotConfigured, serverError } from '@/lib/api-utils';
import { isDbConfigured } from '@/lib/db';
import { getSettings, upsertSettings } from '@/lib/db/queries';
import { encryptionKeyConfigured, encryptSecret } from '@/lib/crypto';
import { getDecryptedApiKey, keyHintFor } from '@/lib/server/api-key';
import { parseBody, settingsPutSchema } from '@/lib/validation';
export async function GET() {
  try {
    if (!isDbConfigured) return dbNotConfigured();
    const userId = await getCurrentUserId();
    const row = await getSettings(userId);
    const keyStored = Boolean(row?.apiKey?.trim());
    // Hint of the plaintext key's tail — derived server-side; the secret itself
    // never leaves the server.
    let keyHint: string | null = null;
    if (keyStored) {
      try {
        const key = await getDecryptedApiKey(userId);
        keyHint = key ? keyHintFor(key) : null;
      } catch {
        keyHint = null;
      }
    }
    return NextResponse.json({
      apiKeySet: keyStored,
      keyHint,
      defaultModel: row?.defaultModel ?? '',
      systemPrompt: row?.systemPrompt ?? '',
    });
  } catch (error) {
    return serverError(error);
  }
}
export async function PUT(request: NextRequest) {
  try {
    if (!isDbConfigured) return dbNotConfigured();
    const parsed = await parseBody(request, settingsPutSchema);
    if (!parsed.ok) return parsed.response;
    const userId = await getCurrentUserId();
    const { apiKey, defaultModel, systemPrompt } = parsed.data;
    // An empty/absent key keeps the stored one — the secret never round-trips
    // through the client.
    if (apiKey && !encryptionKeyConfigured()) {
      return badRequest(
        'Server is missing SETTINGS_ENCRYPTION_KEY, so an API key cannot be stored. See .env.example.',
        'encryption-not-configured',
      );
    }
    await upsertSettings(userId, {
      ...(apiKey ? { apiKey: encryptSecret(apiKey.trim()) } : {}),
      defaultModel: defaultModel?.trim() || null,
      systemPrompt: systemPrompt ?? null,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError(error);
  }
}
