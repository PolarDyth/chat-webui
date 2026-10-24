import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * AES-256-GCM encryption for secrets stored in the database (currently the
 * OpenRouter API key). The key lives outside the database, in
 * SETTINGS_ENCRYPTION_KEY (32 bytes, base64 or hex).
 *
 * Stored format: `v1:<base64(iv | authTag | ciphertext)>`. The version prefix
 * also marks values as encrypted — anything without it is legacy plaintext
 * from before encryption at rest.
 */

const PREFIX = 'v1:';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

let cachedKey: Buffer | null | undefined;

function loadKey(): Buffer | null {
  if (cachedKey !== undefined) return cachedKey;
  const raw = process.env.SETTINGS_ENCRYPTION_KEY?.trim();
  cachedKey = raw ? parseKey(raw) : null;
  return cachedKey;
}

function parseKey(raw: string): Buffer {
  const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `SETTINGS_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes (generate one with: openssl rand -base64 32)`,
    );
  }
  return key;
}

export function encryptionKeyConfigured(): boolean {
  return loadKey() !== null;
}

export function isEncryptedValue(value: string): boolean {
  return value.startsWith(PREFIX);
}

export function encryptSecret(plaintext: string): string {
  const key = loadKey();
  if (!key) {
    throw new Error(
      'SETTINGS_ENCRYPTION_KEY is not set — cannot encrypt secrets. Generate one with: openssl rand -base64 32',
    );
  }
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
}

export function decryptSecret(stored: string): string {
  const key = loadKey();
  if (!key) {
    throw new Error(
      'SETTINGS_ENCRYPTION_KEY is not set — cannot decrypt the stored secret. Restore the key that was used to encrypt it.',
    );
  }
  if (!isEncryptedValue(stored)) {
    throw new Error('Value is not in the expected encrypted format');
  }
  const payload = Buffer.from(stored.slice(PREFIX.length), 'base64');
  const iv = payload.subarray(0, IV_BYTES);
  const tag = payload.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = payload.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
