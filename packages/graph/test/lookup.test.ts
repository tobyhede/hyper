import { describe, expect, it } from 'vitest';
import { loadSpace, resolveContentCard, type Space } from '../src/index';
import { aliasFile, cardFile } from './card-files';

function baseSpace(): Space {
  const result = loadSpace(
    {
      version: 1,
      id: 's',
      title: 'Test',
      routes: [{ id: 'main', title: 'Main', edges: [{ from: 'model', to: 'model-again' }] }],
    },
    [
      cardFile('model', 'The model', 'The model body.\n'),
      aliasFile('model-again', 'The model, again', 'model'),
    ],
  );
  if (!result.ok) throw new Error('fixture should load');
  return result.space;
}

describe('resolveContentCard', () => {
  it('resolves an alias to the card whose content it shows', () => {
    const resolved = resolveContentCard(baseSpace(), 'model-again');
    expect(resolved?.id).toBe('model');
    expect(resolved?.body).toBe('The model body.\n');
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
