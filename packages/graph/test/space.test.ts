import { describe, expect, it } from 'vitest';
import { getCard, getLayout, getRoute, loadSpace } from '../src/index';
import { cardFile } from './card-files';

const validInput = {
  version: 2,
  id: '00000000-0000-4000-8000-000000000001',
  title: 'Test space',
  routes: [
    {
      id: '00000000-0000-4000-8000-000000000004',
      title: 'Main',
      edges: [
        {
          from: '00000000-0000-4000-8000-000000000002',
          to: '00000000-0000-4000-8000-000000000003',
        },
      ],
    },
  ],
};

const validCards = [
  cardFile('00000000-0000-4000-8000-000000000002', 'A', 'Body of A.\n'),
  cardFile('00000000-0000-4000-8000-000000000003', 'B', 'Body of B.\n'),
];

describe('loadSpace', () => {
  it('carries the space id through to the Space', () => {
    const result = loadSpace(validInput, validCards);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.space.id).toBe('00000000-0000-4000-8000-000000000001');
  });

  it('turns valid input into a Space', () => {
    const result = loadSpace(validInput, validCards);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.space.title).toBe('Test space');
    expect(result.space.cards).toHaveLength(2);
    expect(result.space.routes).toHaveLength(1);
  });

  it('builds each card from its file, body included', () => {
    const result = loadSpace(validInput, validCards);
    if (!result.ok) throw new Error('expected a valid space');
    expect(getCard(result.space, '00000000-0000-4000-8000-000000000002')).toEqual({
      id: '00000000-0000-4000-8000-000000000002',
      title: 'A',
      kind: 'markdown',
      body: 'Body of A.\n',
    });
  });

  it('rejects an alias file with a body, because its content comes from its target', () => {
    const result = loadSpace({ ...validInput, routes: [] }, [
      cardFile('00000000-0000-4000-8000-000000000002', 'A', 'The source.\n'),
      {
        path: 'cards/a-again.md',
        text: '---\nid: 00000000-0000-4000-8000-000000000007\ntitle: A again\nkind: alias\ntarget: 00000000-0000-4000-8000-000000000002\n---\n\nThis would be discarded.\n',
      },
    ]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([
      expect.objectContaining({ kind: 'invalid-frontmatter', path: 'cards/a-again.md' }),
    ]);
  });

  it('orders cards by title, whatever order the files arrived in', () => {
    const result = loadSpace({ ...validInput, routes: [] }, [
      cardFile('00000000-0000-4000-8000-000000000005', 'Carla'),
      cardFile('00000000-0000-4000-8000-000000000002', 'Anders'),
      cardFile('00000000-0000-4000-8000-000000000003', 'Bo'),
    ]);
    if (!result.ok) throw new Error('expected a valid space');
    expect(result.space.cards.map((c) => c.title)).toEqual(['Anders', 'Bo', 'Carla']);
  });

  it('rejects the same card id in two files, naming both', () => {
    const result = loadSpace({ ...validInput, routes: [] }, [
      { path: 'intro.md', text: '---\nid: 00000000-0000-4000-8000-000000000002\ntitle: A\n---\n' },
      {
        path: 'cards/a.md',
        text: '---\nid: 00000000-0000-4000-8000-000000000002\ntitle: A again\n---\n',
      },
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const duplicate = result.errors.find((e) => e.kind === 'duplicate-card-id');
    expect(duplicate?.message).toContain('intro.md');
    expect(duplicate?.message).toContain('cards/a.md');
  });

  it('reports a card file that will not parse, without throwing', () => {
    const result = loadSpace({ ...validInput, routes: [] }, [
      { path: 'cards/a.md', text: 'No frontmatter here.\n' },
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.kind === 'missing-frontmatter')).toBe(true);
  });

  it('loads a space with no cards at all — a new space, before anything is written', () => {
    const result = loadSpace({ ...validInput, routes: [] }, []);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.space.cards).toEqual([]);
  });

  it('loads a space with no routes — cards, no structure yet (ADR 0015)', () => {
    const result = loadSpace({ ...validInput, routes: [] }, validCards);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.space.routes).toEqual([]);
    expect(result.space.cards).toHaveLength(2);
    expect(getCard(result.space, '00000000-0000-4000-8000-000000000002')?.title).toBe('A');
  });

  it('reports a bad shape as errors rather than throwing', () => {
    const result = loadSpace({ version: 2, title: 'X' }, validCards); // id and routes missing
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.every((e) => e.kind === 'invalid-shape')).toBe(true);
  });

  it('reports an unresolved reference, though the shape is valid', () => {
    const result = loadSpace(
      {
        ...validInput,
        routes: [
          {
            id: '00000000-0000-4000-8000-000000000004',
            title: 'Main',
            edges: [
              {
                from: '00000000-0000-4000-8000-000000000002',
                to: '00000000-0000-4000-8000-000000000099',
              },
            ],
          },
        ],
      },
      validCards,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(
      result.errors.some(
        (e) =>
          e.kind === 'unresolved-route-edge' && e.ref === '00000000-0000-4000-8000-000000000099',
      ),
    ).toBe(true);
  });

  it('indexes the Space so lookups resolve by id', () => {
    const result = loadSpace(validInput, validCards);
    if (!result.ok) throw new Error('expected a valid space');
    expect(getCard(result.space, '00000000-0000-4000-8000-000000000002')?.title).toBe('A');
    expect(getCard(result.space, 'missing')).toBeUndefined();
    expect(getRoute(result.space, '00000000-0000-4000-8000-000000000004')?.title).toBe('Main');
    expect(getRoute(result.space, 'missing')).toBeUndefined();
  });
});

describe('loadSpace: layouts', () => {
  const working = {
    id: '00000000-0000-4000-8000-000000000022',
    title: 'Working',
    kind: 'positioned',
    positions: {
      '00000000-0000-4000-8000-000000000002': { x: 0, y: 0 },
      '00000000-0000-4000-8000-000000000003': { x: 320, y: 0 },
    },
  };

  it('gives a space with no declared layouts an empty list, never undefined', () => {
    const result = loadSpace(validInput, validCards);
    if (!result.ok) throw new Error('expected a valid space');
    expect(result.space.layouts).toEqual([]);
    expect(result.space.defaultView).toBeUndefined();
  });

  it('carries and indexes the layouts it was given', () => {
    const result = loadSpace(
      { ...validInput, layouts: [working], defaultView: '00000000-0000-4000-8000-000000000022' },
      validCards,
    );
    if (!result.ok) throw new Error('expected a valid space');
    expect(result.space.layouts).toHaveLength(1);
    expect(result.space.defaultView).toBe('00000000-0000-4000-8000-000000000022');
    expect(
      getLayout(result.space, '00000000-0000-4000-8000-000000000022')?.positions[
        '00000000-0000-4000-8000-000000000003'
      ],
    ).toEqual({ x: 320, y: 0 });
    expect(getLayout(result.space, 'missing')).toBeUndefined();
  });

  it('resolves a built-in view name to no declared layout', () => {
    const result = loadSpace({ ...validInput, defaultView: 'graph' }, validCards);
    if (!result.ok) throw new Error('expected a valid space');
    expect(getLayout(result.space, 'graph')).toBeUndefined();
  });

  it('rejects a layout positioning a card that does not exist', () => {
    const result = loadSpace(
      {
        ...validInput,
        layouts: [
          {
            ...working,
            positions: {
              ...working.positions,
              '00000000-0000-4000-8000-000000000099': { x: 1, y: 1 },
            },
          },
        ],
      },
      validCards,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(
      result.errors.some(
        (e) =>
          e.kind === 'layout-position-unknown-card' &&
          e.ref === '00000000-0000-4000-8000-000000000099',
      ),
    ).toBe(true);
  });

  it('rejects a defaultView that names nothing', () => {
    const result = loadSpace(
      { ...validInput, layouts: [working], defaultView: '00000000-0000-4000-8000-000000000098' },
      validCards,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(
      result.errors.some(
        (e) =>
          e.kind === 'unresolved-default-view' && e.ref === '00000000-0000-4000-8000-000000000098',
      ),
    ).toBe(true);
  });
});
