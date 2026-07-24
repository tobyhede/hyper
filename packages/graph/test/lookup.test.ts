import { describe, expect, it } from 'vitest';
import { loadSpace, resolveContentCard, type Space } from '../src/index';
import { aliasFile, cardFile } from './card-files';

function baseSpace(): Space {
  const result = loadSpace(
    {
      version: 1,
      id: 's',
      title: 'Test',
      routes: [{ id: 'main', title: 'Main', steps: [{ target: 'model' }] }],
    },
    [cardFile('model', 'The model'), aliasFile('model-again', 'The model, again', 'model')],
  );
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
