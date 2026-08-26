import { describe, expect, it } from 'vitest';
import { loadSpace, resolveContentCard, type Space } from '../src/index';
import { aliasFile, cardFile, uuid } from './card-files';

function baseSpace(): Space {
  const result = loadSpace(
    {
      version: 1,
      id: uuid('00000000-0000-4000-8000-000000000001'),
      title: 'Test',
      layouts: [
        {
          id: uuid('00000000-0000-4000-8000-000000000022'),
          title: 'Working',
          positions: {
            [uuid('00000000-0000-4000-8000-000000000045')]: { x: 0, y: 0, state: 'closed' },
            [uuid('00000000-0000-4000-8000-000000000044')]: { x: 320, y: 0, state: 'closed' },
          },
          graphs: [
            {
              id: uuid('00000000-0000-4000-8000-000000000004'),
              title: 'Main',
              edges: [
                {
                  from: uuid('00000000-0000-4000-8000-000000000045'),
                  to: uuid('00000000-0000-4000-8000-000000000044'),
                },
              ],
            },
          ],
        },
      ],
    },
    [
      cardFile(uuid('00000000-0000-4000-8000-000000000045'), 'The model', 'The model body.\n'),
      aliasFile(
        uuid('00000000-0000-4000-8000-000000000044'),
        'The model, again',
        uuid('00000000-0000-4000-8000-000000000045'),
      ),
    ],
  );
  if (!result.ok) throw new Error('fixture should load');
  return result.space;
}

describe('resolveContentCard', () => {
  it('resolves an alias to the card whose content it shows', () => {
    const resolved = resolveContentCard(baseSpace(), uuid('00000000-0000-4000-8000-000000000044'));
    expect(resolved?.id).toBe(uuid('00000000-0000-4000-8000-000000000045'));
    expect(resolved?.body).toBe('The model body.\n');
  });

  it('resolves a markdown card to itself', () => {
    const resolved = resolveContentCard(baseSpace(), uuid('00000000-0000-4000-8000-000000000045'));
    expect(resolved?.id).toBe(uuid('00000000-0000-4000-8000-000000000045'));
    expect(resolved?.kind).toBe('markdown');
  });

  it('resolves a card id that names nothing to undefined', () => {
    expect(
      resolveContentCard(baseSpace(), uuid('00000000-0000-4000-8000-000000000098')),
    ).toBeUndefined();
  });
});
