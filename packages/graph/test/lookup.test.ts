import { describe, expect, it } from 'vitest';
import type { Manifest } from '@project/core';
import { resolveContentCard } from '../src/index';

function baseManifest(): Manifest {
  return {
    version: 1,
    title: 'Test',
    cards: [
      { id: 'model', title: 'The model', kind: 'markdown', content: 'cards/model.md' },
      { id: 'model-again', title: 'The model, again', kind: 'alias', target: 'model' },
    ],
    routes: [{ id: 'main', title: 'Main', steps: [{ target: 'model' }] }],
  };
}

describe('resolveContentCard', () => {
  it('resolves an alias to the card whose content it shows', () => {
    const resolved = resolveContentCard(baseManifest(), 'model-again');
    expect(resolved?.id).toBe('model');
  });

  it('resolves a markdown card to itself', () => {
    const resolved = resolveContentCard(baseManifest(), 'model');
    expect(resolved?.id).toBe('model');
    expect(resolved?.kind).toBe('markdown');
  });

  it('resolves a card id that names nothing to undefined', () => {
    expect(resolveContentCard(baseManifest(), 'nowhere')).toBeUndefined();
  });
});
