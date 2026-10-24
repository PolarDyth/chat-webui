import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Issue #5: a minimal .env.example exists, is not gitignored, and the docs
 * no longer steer new setups toward pasting privileged credentials.
 */

describe('env hygiene', () => {
  it('.env.example exists and lists the minimal required variables', () => {
    const example = readFileSync('.env.example', 'utf8');
    expect(example).toMatch(/^DATABASE_URL=/m);
    expect(example).toMatch(/^SETTINGS_ENCRYPTION_KEY=/m);
    expect(example).toMatch(/^# OPENROUTER_API_KEY=/m);
  });

  it('.env.example is not swallowed by the .env* gitignore rule', () => {
    const gitignore = readFileSync('.gitignore', 'utf8');
    expect(gitignore).toContain('!.env.example');
  });

  it('README documents the encryption key and warns against privileged keys', () => {
    const readme = readFileSync('README.md', 'utf8');
    expect(readme).toContain('SETTINGS_ENCRYPTION_KEY');
    expect(readme).toContain('.env.example');
    expect(readme).toMatch(/service\s*role/i);
  });
});
