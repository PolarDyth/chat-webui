import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Issue #2: the provider key is encrypted at rest (AES-256-GCM) before it
 * reaches the database.
 */

const B64_KEY = Buffer.alloc(32, 7).toString('base64');
const HEX_KEY = 'ab'.repeat(32);

type CryptoModule = typeof import('./crypto');

async function loadWithKey(key: string | undefined): Promise<CryptoModule> {
  vi.resetModules();
  if (key === undefined) delete process.env.SETTINGS_ENCRYPTION_KEY;
  else process.env.SETTINGS_ENCRYPTION_KEY = key;
  return import('./crypto');
}

afterEach(() => {
  vi.resetModules();
  delete process.env.SETTINGS_ENCRYPTION_KEY;
});

describe('encryptSecret / decryptSecret', () => {
  it('round-trips a secret', async () => {
    const mod = await loadWithKey(B64_KEY);
    const secret = 'sk-or-v1-abc123';
    const stored = mod.encryptSecret(secret);
    expect(stored.startsWith('v1:')).toBe(true);
    expect(mod.isEncryptedValue(stored)).toBe(true);
    expect(mod.decryptSecret(stored)).toBe(secret);
  });

  it('uses a random IV, so identical secrets encrypt differently', async () => {
    const mod = await loadWithKey(B64_KEY);
    expect(mod.encryptSecret('same')).not.toBe(mod.encryptSecret('same'));
  });

  it('accepts hex keys', async () => {
    const mod = await loadWithKey(HEX_KEY);
    const stored = mod.encryptSecret('hex-keyed');
    expect(mod.decryptSecret(stored)).toBe('hex-keyed');
  });

  it('fails tamper detection when the payload is modified', async () => {
    const mod = await loadWithKey(B64_KEY);
    const stored = mod.encryptSecret('secret');
    const raw = Buffer.from(stored.slice('v1:'.length), 'base64');
    raw[raw.length - 1] ^= 0xff;
    const tampered = 'v1:' + raw.toString('base64');
    expect(() => mod.decryptSecret(tampered)).toThrow();
  });

  it('cannot decrypt with a different key', async () => {
    const first = await loadWithKey(B64_KEY);
    const stored = first.encryptSecret('secret');
    const second = await loadWithKey(HEX_KEY);
    expect(() => second.decryptSecret(stored)).toThrow();
  });

  it('rejects keys that do not decode to 32 bytes', async () => {
    const mod = await loadWithKey(Buffer.alloc(16, 1).toString('base64'));
    expect(() => mod.encryptSecret('x')).toThrow(/SETTINGS_ENCRYPTION_KEY/);
  });

  it('refuses to operate without a configured key', async () => {
    const mod = await loadWithKey(undefined);
    expect(mod.encryptionKeyConfigured()).toBe(false);
    expect(() => mod.encryptSecret('x')).toThrow(/SETTINGS_ENCRYPTION_KEY/);
    expect(() => mod.decryptSecret('v1:AAAA')).toThrow(/SETTINGS_ENCRYPTION_KEY/);
  });

  it('marks non-encrypted values as legacy plaintext', async () => {
    const mod = await loadWithKey(B64_KEY);
    expect(mod.isEncryptedValue('sk-or-v1-plaintext-from-before')).toBe(false);
  });
});
