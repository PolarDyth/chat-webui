import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db/queries', () => ({
  getSettings: vi.fn(),
  updateSettingsApiKey: vi.fn(),
}));

import { getSettings, updateSettingsApiKey } from '@/lib/db/queries';
import { encryptSecret, decryptSecret } from '@/lib/crypto';
import { getDecryptedApiKey, keyHintFor } from '@/lib/server/api-key';

/**
 * Issue #2: server-side key reads decrypt, and legacy plaintext rows are
 * re-encrypted in place (read-repair) — the migration path for the previously
 * plaintext key.
 */

process.env.SETTINGS_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');

const mockedGetSettings = vi.mocked(getSettings);
const mockedUpdate = vi.mocked(updateSettingsApiKey);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getDecryptedApiKey', () => {
  it('decrypts an encrypted stored value', async () => {
    mockedGetSettings.mockResolvedValue({
      userId: 'local-user',
      apiKey: encryptSecret('sk-or-v1-live'),
    } as never);
    await expect(getDecryptedApiKey('local-user')).resolves.toBe('sk-or-v1-live');
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it('returns a legacy plaintext value and re-encrypts it in place', async () => {
    mockedGetSettings.mockResolvedValue({
      userId: 'local-user',
      apiKey: 'sk-or-v1-legacy-plaintext',
    } as never);
    await expect(getDecryptedApiKey('local-user')).resolves.toBe('sk-or-v1-legacy-plaintext');
    expect(mockedUpdate).toHaveBeenCalledTimes(1);
    const [, stored] = mockedUpdate.mock.calls[0];
    expect(stored.startsWith('v1:')).toBe(true);
    expect(decryptSecret(stored)).toBe('sk-or-v1-legacy-plaintext');
  });

  it('still serves the key when the read-repair write fails', async () => {
    mockedGetSettings.mockResolvedValue({ userId: 'local-user', apiKey: 'sk-plain' } as never);
    mockedUpdate.mockRejectedValueOnce(new Error('db down'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(getDecryptedApiKey('local-user')).resolves.toBe('sk-plain');
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('returns null when nothing is stored', async () => {
    mockedGetSettings.mockResolvedValue(null as never);
    await expect(getDecryptedApiKey('local-user')).resolves.toBeNull();
  });

  it('returns null for an empty or blank stored value', async () => {
    mockedGetSettings.mockResolvedValue({ userId: 'local-user', apiKey: '   ' } as never);
    await expect(getDecryptedApiKey('local-user')).resolves.toBeNull();
  });
});

describe('keyHintFor', () => {
  it('exposes only the last four characters', () => {
    expect(keyHintFor('sk-or-v1-2f50')).toBe('…2f50');
  });
});
