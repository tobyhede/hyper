import { describe, expect, it } from 'vitest';
import { getCard, getLayout, getGraph, getGraphOwner, loadSpace } from '../src/index';
import { cardFile, uuid } from './card-files';

const MAIN = {
  id: uuid('00000000-0000-4000-8000-000000000004'),
  title: 'Main',
  edges: [
    {
      from: uuid('00000000-0000-4000-8000-000000000002'),
      to: uuid('00000000-0000-4000-8000-000000000003'),
    },
  ],
};

/** The Layout that owns `MAIN`; its position keys are its Card membership. */
const WORKING = {
  id: uuid('00000000-0000-4000-8000-000000000022'),
  title: 'Working',
  kind: 'positioned',
  positions: {
    [uuid('00000000-0000-4000-8000-000000000002')]: { x: 0, y: 0 },
    [uuid('00000000-0000-4000-8000-000000000003')]: { x: 320, y: 0 },
  },
  graphs: [MAIN],
};

const validInput = {
  version: 1,
  id: uuid('00000000-0000-4000-8000-000000000001'),
  title: 'Test space',
  layouts: [WORKING],
};

/** The same input with no Layouts, and so no Graphs (ADR 0015). */
const noStructure = { ...validInput, layouts: [] };

const validCards = [
  cardFile(uuid('00000000-0000-4000-8000-000000000002'), 'A', 'Body of A.\n'),
  cardFile(uuid('00000000-0000-4000-8000-000000000003'), 'B', 'Body of B.\n'),
];

describe('loadSpace', () => {
  it('carries the space id through to the Space', () => {
    const result = loadSpace(validInput, validCards);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.space.id).toBe(uuid('00000000-0000-4000-8000-000000000001'));
  });

  it('turns valid input into a Space', () => {
    const result = loadSpace(validInput, validCards);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.space.title).toBe('Test space');
    expect(result.space.cards).toHaveLength(2);
    expect(result.space.graphs).toHaveLength(1);
    expect(result.space.layouts).toHaveLength(1);
  });

  /**
   * Creating a Layout creates its initial empty active Graph in the same Edit
   * (ADR 0040), and converting the Flow view returns exactly that (ADR 0045), so
   * a Layout whose only Graph holds no Edges is the first thing a conversion
   * writes. Closure is vacuous over an empty Edge set, not exempt from.
   */
  it('loads a Layout whose only Graph holds no Edges', () => {
    const result = loadSpace(
      {
        ...validInput,
        layouts: [
          {
            ...WORKING,
            graphs: [
              { id: uuid('00000000-0000-4000-8000-000000000004'), title: 'Graph 1', edges: [] },
            ],
          },
        ],
      },
      validCards,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.space.graphs).toHaveLength(1);
    expect(getGraph(result.space, uuid('00000000-0000-4000-8000-000000000004'))?.edges).toEqual([]);
  });

  it('builds each card from its file, body included', () => {
    const result = loadSpace(validInput, validCards);
    if (!result.ok) throw new Error('expected a valid space');
    expect(getCard(result.space, uuid('00000000-0000-4000-8000-000000000002'))).toEqual({
      id: uuid('00000000-0000-4000-8000-000000000002'),
      title: 'A',
      kind: 'markdown',
      body: 'Body of A.\n',
    });
  });

  it('rejects an alias file with a body, because its content comes from its target', () => {
    const result = loadSpace(noStructure, [
      cardFile(uuid('00000000-0000-4000-8000-000000000002'), 'A', 'The source.\n'),
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
    const result = loadSpace(noStructure, [
      cardFile(uuid('00000000-0000-4000-8000-000000000005'), 'Carla'),
      cardFile(uuid('00000000-0000-4000-8000-000000000002'), 'Anders'),
      cardFile(uuid('00000000-0000-4000-8000-000000000003'), 'Bo'),
    ]);
    if (!result.ok) throw new Error('expected a valid space');
    expect(result.space.cards.map((c) => c.title)).toEqual(['Anders', 'Bo', 'Carla']);
  });

  it('rejects the same card id in two files, naming both', () => {
    const result = loadSpace(noStructure, [
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
    const result = loadSpace(noStructure, [{ path: 'cards/a.md', text: 'No frontmatter here.\n' }]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.kind === 'missing-frontmatter')).toBe(true);
  });

  it('loads a space with no cards at all — a new space, before anything is written', () => {
    const result = loadSpace(noStructure, []);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.space.cards).toEqual([]);
  });

  it('loads a space with no layouts — cards, no structure yet (ADR 0015)', () => {
    const result = loadSpace(noStructure, validCards);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.space.graphs).toEqual([]);
    expect(result.space.cards).toHaveLength(2);
    expect(getCard(result.space, uuid('00000000-0000-4000-8000-000000000002'))?.title).toBe('A');
  });

  it('rejects a version 2 document by its version, not by every key that moved', () => {
    // The disposable pre-release shape carried a space-level `graphs` array and
    // layouts with none of their own. Read against version 1 it fails twice over
    // — once per layout missing the graphs it now owns — and none of those
    // issues says the thing worth saying. Hyper is unreleased, so the answer is
    // rejection naming the version, never a migration (ADR 0040).
    const result = loadSpace(
      {
        version: 2,
        id: uuid('00000000-0000-4000-8000-000000000001'),
        title: 'Test space',
        graphs: [
          {
            id: uuid('00000000-0000-4000-8000-000000000004'),
            title: 'Main',
            edges: [
              {
                from: uuid('00000000-0000-4000-8000-000000000002'),
                to: uuid('00000000-0000-4000-8000-000000000003'),
              },
            ],
          },
        ],
        layouts: [
          {
            id: uuid('00000000-0000-4000-8000-000000000022'),
            title: 'Working',
            positions: { [uuid('00000000-0000-4000-8000-000000000002')]: { x: 0, y: 0 } },
          },
        ],
      },
      validCards,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.kind).toBe('unsupported-version');
    expect(result.errors[0]?.message).toContain('2');
  });

  it('rejects a version 1 space that still carries a Space-level graphs array', () => {
    // Read before parsing, beside the version check and for the same reason:
    // `spaceFileSchema` is a plain object, so an undeclared key is *stripped*.
    // That is right for the retired `cards` and `edges` keys, which carried
    // nothing the rest of the document does not already say. A Space-level
    // `graphs` carried the whole topology (ADR 0040), so stripping it in silence
    // discards what its author wrote and yields a Space that loads looking
    // complete. Declaring the key in the schema instead would put it in the
    // inferred document type, which the HTTP contract is checked against.
    const result = loadSpace({ ...validInput, graphs: [MAIN] }, validCards);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.kind).toBe('retired-space-graphs');
    expect(result.errors[0]?.message).toContain('graphs');
  });

  it('accepts a version 1 space whose only graphs are the ones its Layouts own', () => {
    // The other side of the check above: ownership nested under a Layout is the
    // shape, so the key it looks for is absent and nothing is rejected.
    expect(loadSpace(validInput, validCards).ok).toBe(true);
  });

  it('reports a bad shape as errors rather than throwing', () => {
    const result = loadSpace({ version: 1, title: 'X' }, validCards); // id missing
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.every((e) => e.kind === 'invalid-shape')).toBe(true);
  });

  it('reports an unresolved reference, though the shape is valid', () => {
    const result = loadSpace(
      {
        ...validInput,
        layouts: [
          {
            ...WORKING,
            graphs: [
              {
                ...MAIN,
                edges: [
                  {
                    from: uuid('00000000-0000-4000-8000-000000000002'),
                    to: uuid('00000000-0000-4000-8000-000000000099'),
                  },
                ],
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
          e.kind === 'unresolved-graph-edge' &&
          e.ref === uuid('00000000-0000-4000-8000-000000000099'),
      ),
    ).toBe(true);
  });

  it('indexes the Space so lookups resolve by id', () => {
    const result = loadSpace(validInput, validCards);
    if (!result.ok) throw new Error('expected a valid space');
    expect(getCard(result.space, uuid('00000000-0000-4000-8000-000000000002'))?.title).toBe('A');
    expect(getCard(result.space, uuid('00000000-0000-4000-8000-000000000098'))).toBeUndefined();
    expect(getGraph(result.space, uuid('00000000-0000-4000-8000-000000000004'))?.title).toBe(
      'Main',
    );
    expect(getGraph(result.space, uuid('00000000-0000-4000-8000-000000000099'))).toBeUndefined();
  });
});

describe('loadSpace: layouts', () => {
  const working = WORKING;

  it('gives a space with no declared layouts an empty list, never undefined', () => {
    const { layouts: _layouts, ...withoutLayouts } = validInput;
    const result = loadSpace(withoutLayouts, validCards);
    if (!result.ok) throw new Error('expected a valid space');
    expect(result.space.layouts).toEqual([]);
    expect(result.space.graphs).toEqual([]);
    expect(result.space.defaultView).toBeUndefined();
  });

  it('carries and indexes the layouts it was given', () => {
    const result = loadSpace(
      { ...validInput, defaultView: uuid('00000000-0000-4000-8000-000000000022') },
      validCards,
    );
    if (!result.ok) throw new Error('expected a valid space');
    expect(result.space.layouts).toHaveLength(1);
    expect(result.space.defaultView).toBe(uuid('00000000-0000-4000-8000-000000000022'));
    expect(
      getLayout(result.space, uuid('00000000-0000-4000-8000-000000000022'))?.positions[
        uuid('00000000-0000-4000-8000-000000000003')
      ],
    ).toEqual({ x: 320, y: 0 });
    expect(getLayout(result.space, uuid('00000000-0000-4000-8000-000000000099'))).toBeUndefined();
  });

  it('resolves a built-in view name to no declared layout', () => {
    const result = loadSpace({ ...noStructure, defaultView: 'flow' }, validCards);
    if (!result.ok) throw new Error('expected a valid space');
    expect(result.space.layouts).toEqual([]);
  });

  /**
   * The one intake refuses a stale authored file outright rather than reading
   * the version 2 filter as a layout that owns nothing. Shape, not reference:
   * a graph id is not a graph, so no reference check ever runs over it.
   */
  it('rejects a layout whose graphs are ids rather than owned values', () => {
    const result = loadSpace(
      {
        ...validInput,
        layouts: [{ ...working, graphs: [uuid('00000000-0000-4000-8000-000000000004')] }],
      },
      validCards,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.every((error) => error.kind === 'invalid-shape')).toBe(true);
    expect(result.errors.some((error) => error.message.includes('graphs'))).toBe(true);
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
              [uuid('00000000-0000-4000-8000-000000000099')]: { x: 1, y: 1 },
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
          e.ref === uuid('00000000-0000-4000-8000-000000000099'),
      ),
    ).toBe(true);
  });

  it('flattens the graphs its layouts own into one collection, and each answers its owner', () => {
    // The Space keeps `graphs` as a *derived* flatten across its layouts (ADR
    // 0045), which is what leaves colour assignment, handle derivation and
    // Navigation reading one collection while ownership moved underneath them.
    // Ownership is the thing the flatten loses, so it is indexed beside it.
    const result = loadSpace(
      {
        version: 1,
        id: uuid('00000000-0000-4000-8000-000000000001'),
        title: 'Test space',
        layouts: [
          {
            id: uuid('00000000-0000-4000-8000-000000000022'),
            title: 'Working',
            positions: {
              [uuid('00000000-0000-4000-8000-000000000002')]: { x: 0, y: 0 },
              [uuid('00000000-0000-4000-8000-000000000003')]: { x: 320, y: 0 },
            },
            graphs: [
              {
                id: uuid('00000000-0000-4000-8000-000000000004'),
                title: 'Main',
                edges: [
                  {
                    from: uuid('00000000-0000-4000-8000-000000000002'),
                    to: uuid('00000000-0000-4000-8000-000000000003'),
                  },
                ],
              },
            ],
          },
          {
            id: uuid('00000000-0000-4000-8000-000000000023'),
            title: 'Second',
            positions: {
              [uuid('00000000-0000-4000-8000-000000000002')]: { x: 0, y: 200 },
              [uuid('00000000-0000-4000-8000-000000000003')]: { x: 320, y: 200 },
            },
            graphs: [
              {
                id: uuid('00000000-0000-4000-8000-000000000005'),
                title: 'Aside',
                edges: [
                  {
                    from: uuid('00000000-0000-4000-8000-000000000003'),
                    to: uuid('00000000-0000-4000-8000-000000000002'),
                  },
                ],
              },
            ],
          },
        ],
      },
      validCards,
    );

    if (!result.ok) throw new Error('expected a valid space');
    expect(result.space.graphs.map((graph) => graph.title)).toEqual(['Main', 'Aside']);
    expect(getGraph(result.space, uuid('00000000-0000-4000-8000-000000000005'))?.title).toBe(
      'Aside',
    );
    expect(getGraphOwner(result.space, uuid('00000000-0000-4000-8000-000000000004'))?.title).toBe(
      'Working',
    );
    expect(getGraphOwner(result.space, uuid('00000000-0000-4000-8000-000000000005'))?.title).toBe(
      'Second',
    );
    expect(
      getGraphOwner(result.space, uuid('00000000-0000-4000-8000-000000000099')),
    ).toBeUndefined();
  });

  it('rejects a defaultView that names nothing', () => {
    const result = loadSpace(
      { ...validInput, defaultView: uuid('00000000-0000-4000-8000-000000000098') },
      validCards,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(
      result.errors.some(
        (e) =>
          e.kind === 'unresolved-default-view' &&
          e.ref === uuid('00000000-0000-4000-8000-000000000098'),
      ),
    ).toBe(true);
  });
});
