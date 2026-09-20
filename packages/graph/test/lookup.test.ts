import { describe, expect, it } from 'vitest';
import { loadSpace, resolveContentResource, type Space } from '../src/index';
import { referenceFile, resourceFile, uuid } from './resource-files';

function baseSpace(): Space {
  const result = loadSpace(
    {
      version: 1,
      id: uuid('00000000-0000-4000-8000-000000000001'),
      title: 'Test',
      maps: [
        {
          id: uuid('00000000-0000-4000-8000-000000000022'),
          title: 'Working',
          positions: {
            [uuid('00000000-0000-4000-8000-000000000045')]: { x: 0, y: 0, open: false },
            [uuid('00000000-0000-4000-8000-000000000044')]: { x: 320, y: 0, open: false },
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
      resourceFile(uuid('00000000-0000-4000-8000-000000000045'), 'The model', 'The model body.\n'),
      referenceFile(
        uuid('00000000-0000-4000-8000-000000000044'),
        'The model, again',
        uuid('00000000-0000-4000-8000-000000000045'),
      ),
    ],
  );
  if (!result.ok) throw new Error('fixture should load');
  return result.space;
}

describe('resolveContentResource', () => {
  it('resolves a reference resource to the resource whose content it shows', () => {
    const resolved = resolveContentResource(
      baseSpace(),
      uuid('00000000-0000-4000-8000-000000000044'),
    );
    expect(resolved?.id).toBe(uuid('00000000-0000-4000-8000-000000000045'));
    expect(resolved?.kind === 'markdown' ? resolved.body : undefined).toBe('The model body.\n');
  });

  it('resolves a markdown resource to itself', () => {
    const resolved = resolveContentResource(
      baseSpace(),
      uuid('00000000-0000-4000-8000-000000000045'),
    );
    expect(resolved?.id).toBe(uuid('00000000-0000-4000-8000-000000000045'));
    expect(resolved?.kind).toBe('markdown');
  });

  it('resolves a resource id that names nothing to undefined', () => {
    expect(
      resolveContentResource(baseSpace(), uuid('00000000-0000-4000-8000-000000000098')),
    ).toBeUndefined();
  });
});
