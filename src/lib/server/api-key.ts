import { decryptSecret, encryptSecret, isEncryptedValue } from '@/lib/crypto';
import { getSettings, updateSettingsApiKey } from '@/lib/db/queries';

/**
 * Server-side access to the stored provider API key. The plaintext key exists
 * only inside this module's callers on the server — it is never returned by an
 * API route, and the database only ever holds encrypted values.
 */

/** Short, non-secret identifier for UI display ("…last4"). */
export function keyHintFor(key: string): string {
  return `…${key.slice(-4)}`;
}

/**
 * Read the stored key for provider calls. Values written before encryption at
 * rest (no `v1:` prefix) are re-encrypted in place on first read, which
 * migrates legacy rows without a separate migration step.
 */
export async function getDecryptedApiKey(userId: string): Promise<string | null> {
  const row = await getSettings(userId);
  const stored = row?.apiKey?.trim() || null;
  if (!stored) return null;

  if (!isEncryptedValue(stored)) {
    try {
      await updateSettingsApiKey(userId, encryptSecret(stored));
    } catch (error) {
      // Repair is best-effort; the legacy plaintext key still works.
      console.error('[api-key] failed to re-encrypt legacy plaintext key:', error);
    }
    return stored;
  }

  return decryptSecret(stored);
}
