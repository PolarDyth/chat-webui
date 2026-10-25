import { describe, expect, it } from 'vitest';
import { AUTO_MODEL, FREE_MODEL } from '@/lib/types';
import { isConcreteModelSlug, planRouting } from '@/lib/ai';

/**
 * Issue #18: the first routed turn in a chat pins Smart Auto's decision, and
 * every later turn reuses it without a classifier call. Meta-slugs never pin,
 * so a slow or failed classification leaves the chat unpinned for next turn.
 */

describe('isConcreteModelSlug', () => {
  it('accepts provider slugs', () => {
    expect(isConcreteModelSlug('openai/gpt-5.2')).toBe(true);
    expect(isConcreteModelSlug('nvidia/nemotron-3.5-lightning:free')).toBe(true);
  });

  it('rejects nullish values and routing meta-slugs', () => {
    expect(isConcreteModelSlug(null)).toBe(false);
    expect(isConcreteModelSlug(undefined)).toBe(false);
    expect(isConcreteModelSlug('')).toBe(false);
    expect(isConcreteModelSlug(AUTO_MODEL)).toBe(false);
    expect(isConcreteModelSlug(FREE_MODEL)).toBe(false);
  });
});

describe('planRouting', () => {
  it('never routes in manual mode', () => {
    expect(planRouting({ mode: 'manual', storedRoutedModel: 'x/y', freeOnly: false })).toEqual({
      classify: false,
      freeOnly: false,
      pinnedModel: null,
    });
  });

  it('reuses a concrete pinned model without classifying', () => {
    expect(planRouting({ mode: 'auto', storedRoutedModel: 'x/y', freeOnly: false })).toEqual({
      classify: false,
      freeOnly: false,
      pinnedModel: 'x/y',
    });
    expect(planRouting({ mode: 'free', storedRoutedModel: 'x/y:free', freeOnly: false })).toEqual({
      classify: false,
      freeOnly: false,
      pinnedModel: 'x/y:free',
    });
  });

  it('classifies the first auto turn with the user free-only setting', () => {
    expect(planRouting({ mode: 'auto', freeOnly: false })).toEqual({
      classify: true,
      freeOnly: false,
      pinnedModel: null,
    });
    expect(planRouting({ mode: 'auto', freeOnly: true })).toEqual({
      classify: true,
      freeOnly: true,
      pinnedModel: null,
    });
  });

  it('forces free-only classification in free mode', () => {
    expect(planRouting({ mode: 'free', freeOnly: false })).toEqual({
      classify: true,
      freeOnly: true,
      pinnedModel: null,
    });
  });

  it('ignores stored meta-slugs so the next turn routes fresh', () => {
    expect(planRouting({ mode: 'auto', storedRoutedModel: AUTO_MODEL, freeOnly: false })).toEqual({
      classify: true,
      freeOnly: false,
      pinnedModel: null,
    });
    expect(planRouting({ mode: 'free', storedRoutedModel: FREE_MODEL, freeOnly: false })).toEqual({
      classify: true,
      freeOnly: true,
      pinnedModel: null,
    });
  });
});
