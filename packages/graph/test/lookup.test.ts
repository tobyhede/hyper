import { describe, expect, it } from 'vitest';
import { loadSpace, resolveContentCard, type Space } from '../src/index';
import { aliasFile, cardFile } from './card-files';

function baseSpace(): Space {
  const result = loadSpace(
    {
      version: 2,
      id: '00000000-0000-4000-8000-000000000001',
      title: 'Test',
      routes: [
        {
          id: '00000000-0000-4000-8000-000000000004',
          title: 'Main',
          edges: [
            {
              from: '00000000-0000-4000-8000-000000000045',
              to: '00000000-0000-4000-8000-000000000044',
            },
          ],
        },
      ],
    },
    [
      cardFile('00000000-0000-4000-8000-000000000045', 'The model', 'The model body.\n'),
      aliasFile(
        '00000000-0000-4000-8000-000000000044',
        'The model, again',
        '00000000-0000-4000-8000-000000000045',
      ),
    ],
  );
  if (!result.ok) throw new Error('fixture should load');
  return result.space;
}

describe('resolveContentCard', () => {
  it('resolves an alias to the card whose content it shows', () => {
    const resolved = resolveContentCard(baseSpace(), '00000000-0000-4000-8000-000000000044');
    expect(resolved?.id).toBe('00000000-0000-4000-8000-000000000045');
    expect(resolved?.body).toBe('The model body.\n');
  });

  it('resolves a markdown card to itself', () => {
    const resolved = resolveContentCard(baseSpace(), '00000000-0000-4000-8000-000000000045');
    expect(resolved?.id).toBe('00000000-0000-4000-8000-000000000045');
    expect(resolved?.kind).toBe('markdown');
  });

  it('resolves a card id that names nothing to undefined', () => {
    expect(resolveContentCard(baseSpace(), '00000000-0000-4000-8000-000000000098')).toBeUndefined();
  });
});
