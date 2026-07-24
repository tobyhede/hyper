import { describe, expect, it } from 'vitest';
import { loadSpace, resolveContentCard, type Space } from '../src/index';

function baseSpace(): Space {
  const result = loadSpace({
    version: 1,
    id: 's',
    title: 'Test',
    cards: [
      { id: 'model', title: 'The model', kind: 'markdown', content: 'cards/model.md' },
      { id: 'model-again', title: 'The model, again', kind: 'alias', target: 'model' },
    ],
    routes: [{ id: 'main', title: 'Main', steps: [{ target: 'model' }] }],
  });
  if (!result.ok) throw new Error('fixture should load');
  return result.space;
}

describe('resolveContentCard', () => {
  it('resolves an alias to the card whose content it shows', () => {
    const resolved = resolveContentCard(baseSpace(), 'model-again');
    expect(resolved?.id).toBe('model');
  });

  it('resolves a markdown card to itself', () => {
    const resolved = resolveContentCard(baseSpace(), 'model');
    expect(resolved?.id).toBe('model');
    expect(resolved?.kind).toBe('markdown');
  });

  it('resolves a card id that names nothing to undefined', () => {
    expect(resolveContentCard(baseSpace(), 'nowhere')).toBeUndefined();
  });
});
