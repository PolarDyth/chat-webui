import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import {
  chatPatchSchema,
  chatRequestSchema,
  parseBody,
  selectVariantIndexSchema,
  settingsPutSchema,
  variantAppendSchema,
} from '@/lib/validation';

/**
 * Issue #7: request bodies are validated at the route boundary, path ids are
 * UUID-checked, and persisted JSON shapes are constrained.
 */

const UUID = 'd6b3f3a6-9d47-4b6a-9a2e-5b8f1c7d1234';

const validChatRequest = {
  id: UUID,
  messages: [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hello' }] }],
};

function post(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/test', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('chatRequestSchema', () => {
  it('accepts the shape the transport sends', () => {
    const parsed = chatRequestSchema.safeParse({
      ...validChatRequest,
      trigger: 'submit-message',
      mode: 'auto',
      model: 'openai/gpt-4o',
      messageId: 'm1',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects non-UUID chat ids', () => {
    expect(chatRequestSchema.safeParse({ ...validChatRequest, id: 'not-a-uuid' }).success).toBe(
      false,
    );
  });

  it('rejects empty message lists and oversized arrays', () => {
    expect(chatRequestSchema.safeParse({ id: UUID, messages: [] }).success).toBe(false);
    const many = Array.from({ length: 201 }, (_, i) => ({
      id: `m${i}`,
      role: 'user',
      parts: [],
    }));
    expect(chatRequestSchema.safeParse({ id: UUID, messages: many }).success).toBe(false);
  });

  it('rejects unknown roles and unknown triggers', () => {
    expect(
      chatRequestSchema.safeParse({
        id: UUID,
        messages: [{ id: 'm1', role: 'tool', parts: [] }],
      }).success,
    ).toBe(false);
    expect(
      chatRequestSchema.safeParse({ ...validChatRequest, trigger: 'delete-everything' }).success,
    ).toBe(false);
  });

  it('rejects unknown modes and oversized model strings', () => {
    expect(chatRequestSchema.safeParse({ ...validChatRequest, mode: 'yolo' }).success).toBe(false);
    expect(
      chatRequestSchema.safeParse({ ...validChatRequest, model: 'x'.repeat(201) }).success,
    ).toBe(false);
  });

  it('rejects parts without a string type', () => {
    expect(
      chatRequestSchema.safeParse({
        id: UUID,
        messages: [{ id: 'm1', role: 'user', parts: [{ text: 'no type' }] }],
      }).success,
    ).toBe(false);
    expect(
      chatRequestSchema.safeParse({
        id: UUID,
        messages: [{ id: 'm1', role: 'user', parts: [{ type: 42 }] }],
      }).success,
    ).toBe(false);
  });

  it('keeps part payloads verbatim (the AI SDK owns their shape)', () => {
    const parsed = chatRequestSchema.parse(validChatRequest);
    expect(parsed.messages[0].parts[0]).toEqual({ type: 'text', text: 'hello' });
  });
});

describe('chatPatchSchema', () => {
  it('accepts a partial patch and an empty patch', () => {
    expect(chatPatchSchema.safeParse({ pinned: true }).success).toBe(true);
    expect(chatPatchSchema.safeParse({}).success).toBe(true);
  });

  it('rejects unknown modes, oversized titles, and non-boolean pins', () => {
    expect(chatPatchSchema.safeParse({ mode: 'turbo' }).success).toBe(false);
    expect(chatPatchSchema.safeParse({ title: 'x'.repeat(201) }).success).toBe(false);
    expect(chatPatchSchema.safeParse({ pinned: 'yes' }).success).toBe(false);
  });
});

describe('settingsPutSchema', () => {
  it('enforces length caps', () => {
    expect(settingsPutSchema.safeParse({ apiKey: 'k'.repeat(401) }).success).toBe(false);
    expect(settingsPutSchema.safeParse({ systemPrompt: 's'.repeat(8001) }).success).toBe(false);
    expect(settingsPutSchema.safeParse({ apiKey: 'sk-or-v1-x' }).success).toBe(true);
  });

  it('rejects a non-string key', () => {
    expect(settingsPutSchema.safeParse({ apiKey: 12_345 }).success).toBe(false);
  });
});

describe('variantAppendSchema / selectVariantIndexSchema', () => {
  it('keeps only known top-level fields on a variant', () => {
    const parsed = variantAppendSchema.parse({
      variant: {
        parts: [{ type: 'text', text: 'a' }],
        metadata: { createdAt: '2026-10-24' },
        smuggled: 'drop me',
      },
    });
    expect(parsed.variant).toEqual({
      parts: [{ type: 'text', text: 'a' }],
      metadata: { createdAt: '2026-10-24' },
    });
  });

  it('rejects variants without parts', () => {
    expect(variantAppendSchema.safeParse({ variant: { metadata: {} } }).success).toBe(false);
  });

  it('requires a non-negative integer index', () => {
    expect(selectVariantIndexSchema.safeParse({ selectVariantIndex: 0 }).success).toBe(true);
    expect(selectVariantIndexSchema.safeParse({ selectVariantIndex: 1.5 }).success).toBe(false);
    expect(selectVariantIndexSchema.safeParse({ selectVariantIndex: -1 }).success).toBe(false);
  });
});

describe('parseBody', () => {
  it('returns the parsed data for valid JSON', async () => {
    const result = await parseBody(post(validChatRequest), chatRequestSchema);
    expect(result.ok).toBe(true);
  });

  it('returns a 400 for malformed JSON', async () => {
    const result = await parseBody(post('{nope'), chatRequestSchema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(400);
      const body = await result.response.json();
      expect(body.error).toBe('bad-request');
    }
  });

  it('returns a 400 whose message names the failing field', async () => {
    const result = await parseBody(post({ id: 'nope', messages: [] }), chatRequestSchema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const body = (await result.response.json()) as { message: string };
      expect(body.message).toMatch(/^id:/);
    }
  });
});
