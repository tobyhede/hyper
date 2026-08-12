import { describe, expect, it } from 'vitest';
import { loadSpace } from '../src/index';
import { cardFile, uuid } from './card-files';

/**
 * `loadSpace`'s own half of intake: the space file's shape, the card files
 * beside it, and the version it declares.
 *
 * What it shares with `loadSpaceSnapshot` — the aggregate relationships, the
 * lookup and every reference diagnosis — is proved once against both, in
 * `space-intake.test.ts`. Restating any of it here would be a second copy of a
 * contract that already runs twice.
 */

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
  it('carries the space id and title through to the Space', () => {
    const result = loadSpace(validInput, validCards);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.space.id).toBe(uuid('00000000-0000-4000-8000-000000000001'));
    expect(result.space.title).toBe('Test space');
    expect(result.space.cards).toHaveLength(2);
    expect(result.space.graphs).toHaveLength(1);
    expect(result.space.layouts).toHaveLength(1);
  });

  it('builds each card from its file, body included', () => {
    const result = loadSpace(validInput, validCards);
    if (!result.ok) throw new Error('expected a valid space');
    expect(result.space.lookup.card(uuid('00000000-0000-4000-8000-000000000002'))).toEqual({
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
        graphs: [MAIN],
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

  it('gives a space with no declared layouts an empty list, never undefined', () => {
    const { layouts: _layouts, ...withoutLayouts } = validInput;
    const result = loadSpace(withoutLayouts, validCards);
    if (!result.ok) throw new Error('expected a valid space');
    expect(result.space.layouts).toEqual([]);
    expect(result.space.graphs).toEqual([]);
    expect(result.space.defaultView).toBeUndefined();
  });

  it('carries a declared layout’s positions through unchanged', () => {
    const result = loadSpace(
      { ...validInput, defaultView: uuid('00000000-0000-4000-8000-000000000022') },
      validCards,
    );
    if (!result.ok) throw new Error('expected a valid space');
    expect(result.space.defaultView).toBe(uuid('00000000-0000-4000-8000-000000000022'));
    expect(
      result.space.lookup.layout(uuid('00000000-0000-4000-8000-000000000022'))?.layout.positions[
        uuid('00000000-0000-4000-8000-000000000003')
      ],
    ).toEqual({ x: 320, y: 0 });
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
        layouts: [{ ...WORKING, graphs: [uuid('00000000-0000-4000-8000-000000000004')] }],
      },
      validCards,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.every((error) => error.kind === 'invalid-shape')).toBe(true);
    expect(result.errors.some((error) => error.message.includes('graphs'))).toBe(true);
  });
});
