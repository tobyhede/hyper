import { describe, expect, it } from 'vitest';
import {
  COMPUTED_VIEW_IDS,
  FLOW_SPACE_VIEW_ID,
  GRID_SPACE_VIEW_ID,
  cardFrontmatterSchema,
  cardSchema,
  isComputedViewId,
  spaceFileSchema,
  uuidSchema,
} from '../src/index';

const MAIN = {
  id: '00000000-0000-4000-8000-000000000004',
  title: 'Main',
  edges: [
    { from: '00000000-0000-4000-8000-000000000002', to: '00000000-0000-4000-8000-000000000003' },
  ],
};

/** The Layout that owns `MAIN`; positions are its Card membership (ADR 0040). */
const WORKING = {
  id: '00000000-0000-4000-8000-000000000010',
  title: 'Working',
  kind: 'positioned',
  positions: {
    '00000000-0000-4000-8000-000000000002': { x: 0, y: 0, open: false },
    '00000000-0000-4000-8000-000000000003': { x: 320, y: -40, open: false },
  },
  graphs: [MAIN],
};

const validSpaceFile = {
  version: 1,
  id: '00000000-0000-4000-8000-000000000001',
  title: 'Test deck',
  layouts: [WORKING],
};

/** A layout carrying one graph, for cases that vary only the graph. */
const withGraphs = (graphs: unknown[]) => ({
  ...validSpaceFile,
  layouts: [{ ...WORKING, graphs }],
});

describe('space file schema', () => {
  it('nests a Graph under the Layout that owns it, with no Space-level collection', () => {
    // ADR 0040: a Graph is an owned value of one Layout. The Space-level array
    // is gone, and a file carrying one is rejected rather than half-read — by
    // `loadSpace`, not here. This schema is a plain object, so it *strips* a key
    // it does not declare, and declaring the retired one would put it in the
    // inferred document type the HTTP contract is checked against. The rejection
    // is a pre-parse check beside the version answer; `space.test.ts` covers it.
    const file = spaceFileSchema.parse({
      version: 1,
      id: '00000000-0000-4000-8000-000000000001',
      title: 'Test deck',
      layouts: [
        {
          id: '00000000-0000-4000-8000-000000000010',
          title: 'Working',
          positions: {
            '00000000-0000-4000-8000-000000000002': { x: 0, y: 0, open: false },
            '00000000-0000-4000-8000-000000000003': { x: 320, y: -40, open: false },
          },
          graphs: [
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
        },
      ],
    });

    expect('graphs' in file).toBe(false);
    expect(file.layouts?.[0]?.graphs.map((graph) => graph.title)).toEqual(['Main']);
  });

  it('requires the space to name itself', () => {
    // Required today; ADR 0019 makes ids optional and generated on load, and
    // this is the assertion that will change when it does.
    const { id: _id, ...withoutId } = validSpaceFile;
    const result = spaceFileSchema.safeParse(withoutId);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.path).toEqual(['id']);
  });

  it('rejects an empty space id', () => {
    expect(spaceFileSchema.safeParse({ ...validSpaceFile, id: '' }).success).toBe(false);
  });

  it('parses a valid space file', () => {
    const file = spaceFileSchema.parse(validSpaceFile);
    expect(file.title).toBe('Test deck');
    expect(file.layouts?.[0]?.graphs).toHaveLength(1);
  });

  it('holds no cards — a card exists because its file does (ADR 0020)', () => {
    // The same treatment a top-level `edges` array gets: an older file still
    // parses, and the array is dropped rather than honoured, so nothing can
    // half-load from it.
    const result = spaceFileSchema.safeParse({
      ...validSpaceFile,
      cards: [{ id: '00000000-0000-4000-8000-000000000002', title: 'A', content: 'cards/a.md' }],
    });
    expect(result.success).toBe(true);
    expect(result.success && 'cards' in result.data).toBe(false);
  });

  it('rejects version 2, which put the graphs beside the layouts instead of in them', () => {
    // The disposable pre-release shape. Hyper is unreleased, so it has no
    // compatibility claim on the first-public one and is rejected, not migrated
    // (ADR 0040). `loadSpace` says so in one error; here it is the literal.
    const result = spaceFileSchema.safeParse({
      version: 2,
      id: '00000000-0000-4000-8000-000000000001',
      title: 'Old space',
      graphs: [MAIN],
      layouts: [
        {
          id: '00000000-0000-4000-8000-000000000010',
          title: 'Working',
          positions: { '00000000-0000-4000-8000-000000000002': { x: 0, y: 0, open: false } },
          activeGraph: '00000000-0000-4000-8000-000000000004',
        },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'version')).toBe(true);
    }
  });

  it('rejects slug identity everywhere an id appears', () => {
    const result = spaceFileSchema.safeParse({
      version: 1,
      id: 'space',
      title: 'Old space',
      layouts: [
        {
          id: 'working',
          title: 'Working',
          positions: { a: { x: 0, y: 0, open: false } },
          graphs: [{ id: 'main', title: 'Main', edges: [{ from: 'a', to: 'b' }] }],
        },
      ],
      defaultRenderer: 'working',
    });
    expect(result.success).toBe(false);
  });

  it('drops a top-level edges array, which graphs replaced', () => {
    // ADR 0007 deleted the structural layer beside graphs; a graph's own `edges`
    // (ADR 0032) are a different thing that happens to share the word. An older
    // file carrying the old array still parses, and the array is ignored.
    const result = spaceFileSchema.safeParse({
      ...validSpaceFile,
      edges: [
        {
          id: '00000000-0000-4000-8000-000000000008',
          source: '00000000-0000-4000-8000-000000000002',
          target: '00000000-0000-4000-8000-000000000003',
        },
      ],
    });
    expect(result.success).toBe(true);
    expect(result.success && 'edges' in result.data).toBe(false);
  });

  it('accepts a space file with no layouts — a new space has no structure yet', () => {
    // ADR 0015. It renders; it cannot be presented. A Layout owns at least one
    // Graph (ADR 0040), so having no Layouts is what having no Graphs now is.
    const { layouts: _layouts, ...withoutLayouts } = validSpaceFile;
    expect(spaceFileSchema.safeParse(withoutLayouts).success).toBe(true);
    expect(spaceFileSchema.safeParse({ ...validSpaceFile, layouts: [] }).success).toBe(true);
  });

  it('rejects a layout that owns no graphs — one is the fewest it is created with', () => {
    // Creating a Layout creates its initial Graph in the same Edit, and Graph
    // management cannot delete the last (ADR 0040), so none is a state no
    // gesture produces.
    expect(spaceFileSchema.safeParse(withGraphs([])).success).toBe(false);
  });

  it('requires the graphs key on a layout, so a dropped array is a shape error', () => {
    const { graphs: _graphs, ...withoutGraphs } = WORKING;
    expect(spaceFileSchema.safeParse({ ...validSpaceFile, layouts: [withoutGraphs] }).success).toBe(
      false,
    );
  });

  it('accepts a graph with no edges — a Layout mints its initial Graph empty', () => {
    // Creating a Layout creates its initial empty Active Graph in the same Edit
    // (ADR 0040), and the Flow view converts by returning exactly that (ADR
    // 0045), so an edge-less Graph is a state the product produces on the first
    // Card the author moves. Deleting the last Edge of a Graph leaves the same
    // shape. The superseded rule read a Graph as minted *by* drawing an Edge.
    const result = spaceFileSchema.safeParse(
      withGraphs([{ id: '00000000-0000-4000-8000-000000000004', title: 'Main', edges: [] }]),
    );
    expect(result.success).toBe(true);
  });

  it('accepts a graph that forks and merges — shape puts no limit on either', () => {
    // Edge-set uniqueness and resolved endpoints need the whole Graph/Space in
    // view, so it lives in `@project/graph`; nothing here should reject a graph.
    const result = spaceFileSchema.safeParse(
      withGraphs([
        {
          id: '00000000-0000-4000-8000-000000000004',
          title: 'Main',
          edges: [
            {
              from: '00000000-0000-4000-8000-000000000002',
              to: '00000000-0000-4000-8000-000000000003',
            },
            {
              from: '00000000-0000-4000-8000-000000000002',
              to: '00000000-0000-4000-8000-000000000005',
            },
            {
              from: '00000000-0000-4000-8000-000000000003',
              to: '00000000-0000-4000-8000-000000000006',
            },
            {
              from: '00000000-0000-4000-8000-000000000005',
              to: '00000000-0000-4000-8000-000000000006',
            },
          ],
        },
      ]),
    );
    expect(result.success).toBe(true);
  });

  it('rejects an edge missing an endpoint', () => {
    for (const edge of [
      { from: '00000000-0000-4000-8000-000000000002' },
      { to: '00000000-0000-4000-8000-000000000003' },
      { from: '00000000-0000-4000-8000-000000000002', to: '' },
    ]) {
      const result = spaceFileSchema.safeParse(
        withGraphs([{ id: '00000000-0000-4000-8000-000000000004', title: 'Main', edges: [edge] }]),
      );
      expect(result.success).toBe(false);
    }
  });
});

describe('card frontmatter schema', () => {
  it('rejects an empty card id', () => {
    expect(cardFrontmatterSchema.safeParse({ id: '', title: 'A' }).success).toBe(false);
  });

  it('defaults a card with no kind to markdown, so the common card declares neither', () => {
    const card = cardFrontmatterSchema.parse({
      id: '00000000-0000-4000-8000-000000000002',
      title: 'A',
    });
    expect(card.kind).toBe('markdown');
  });

  it('holds no content key — the file the frontmatter sits in is the content', () => {
    const card = cardFrontmatterSchema.parse({
      id: '00000000-0000-4000-8000-000000000002',
      title: 'A',
      content: 'cards/a.md',
    });
    expect('content' in card).toBe(false);
  });

  it('parses an alias card, which points at a target instead of holding content', () => {
    const alias = cardFrontmatterSchema.parse({
      id: '00000000-0000-4000-8000-000000000007',
      title: 'A, again',
      kind: 'alias',
      target: '00000000-0000-4000-8000-000000000002',
    });
    expect(alias.kind).toBe('alias');
    expect(alias.kind === 'alias' && alias.target).toBe('00000000-0000-4000-8000-000000000002');
  });

  it('gives an alias no body field at all', () => {
    const alias = cardSchema.parse({
      id: '00000000-0000-4000-8000-000000000007',
      title: 'A, again',
      kind: 'alias',
      target: '00000000-0000-4000-8000-000000000002',
    });

    expect('body' in alias).toBe(false);
  });

  it('rejects an alias with no target', () => {
    expect(
      cardFrontmatterSchema.safeParse({
        id: '00000000-0000-4000-8000-000000000002',
        title: 'A',
        kind: 'alias',
      }).success,
    ).toBe(false);
  });

  it('does not make Description part of the shared Card contract', () => {
    const card = cardFrontmatterSchema.parse({
      id: '00000000-0000-4000-8000-000000000002',
      title: 'A',
      description: 'What A is',
    });
    expect('description' in card).toBe(false);
  });
});

describe('space file layouts', () => {
  const working = WORKING;

  it('parses a file that declares no layouts — the hand-authored case', () => {
    const { layouts: _layouts, ...withoutLayouts } = validSpaceFile;
    const file = spaceFileSchema.parse(withoutLayouts);
    expect(file.layouts).toBeUndefined();
    expect(file.defaultRenderer).toBeUndefined();
  });

  it('parses a positioned layout and its positions', () => {
    const file = spaceFileSchema.parse({ ...validSpaceFile, layouts: [working] });
    const layout = file.layouts?.[0];
    expect(layout?.kind).toBe('positioned');
    expect(layout?.positions).toEqual({
      '00000000-0000-4000-8000-000000000002': { x: 0, y: 0, open: false },
      '00000000-0000-4000-8000-000000000003': { x: 320, y: -40, open: false },
    });
  });

  it('requires an Expanded Card to be at least the Closed Card size', () => {
    const positions = (width: number, height: number) => ({
      '00000000-0000-4000-8000-000000000002': {
        x: 0,
        y: 0,
        open: true,
        openSize: { width, height },
      },
    });

    expect(
      spaceFileSchema.safeParse({
        ...validSpaceFile,
        layouts: [{ ...working, positions: positions(259, 146) }],
      }).success,
    ).toBe(false);
    expect(
      spaceFileSchema.safeParse({
        ...validSpaceFile,
        layouts: [{ ...working, positions: positions(260, 145) }],
      }).success,
    ).toBe(false);
    expect(
      spaceFileSchema.safeParse({
        ...validSpaceFile,
        layouts: [{ ...working, positions: positions(260, 146) }],
      }).success,
    ).toBe(true);
  });

  it('defaults a layout with no kind to positioned, so one can be hand-written', () => {
    const file = spaceFileSchema.parse({
      ...validSpaceFile,
      layouts: [
        {
          id: '00000000-0000-4000-8000-000000000010',
          title: 'Working',
          positions: {},
          graphs: [MAIN],
        },
      ],
    });
    expect(file.layouts?.[0]?.kind).toBe('positioned');
  });

  it('accepts an empty position map — positions are sparse, and none is the limit', () => {
    const file = spaceFileSchema.parse({
      ...validSpaceFile,
      layouts: [{ ...working, positions: {} }],
    });
    expect(file.layouts?.[0]?.positions).toEqual({});
  });

  it('rejects a position that is not a point', () => {
    for (const positions of [
      { '00000000-0000-4000-8000-000000000002': { x: 0 } },
      { '00000000-0000-4000-8000-000000000002': [0, 0] },
      { '00000000-0000-4000-8000-000000000002': { x: '0', y: '0', open: false } },
    ]) {
      expect(
        spaceFileSchema.safeParse({ ...validSpaceFile, layouts: [{ ...working, positions }] })
          .success,
      ).toBe(false);
    }
  });

  it('rejects a position keyed by an empty card id', () => {
    const result = spaceFileSchema.safeParse({
      ...validSpaceFile,
      layouts: [{ ...working, positions: { '': { x: 0, y: 0, open: false } } }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a layout kind it does not know', () => {
    const result = spaceFileSchema.safeParse({
      ...validSpaceFile,
      layouts: [
        {
          id: '00000000-0000-4000-8000-000000000098',
          title: 'Auto',
          kind: 'elk',
          positions: {},
          graphs: [MAIN],
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a layout whose graphs are ids rather than owned values', () => {
    // The version 2 filter, which named the graphs a layout drew. It shares a
    // key with the collection a layout now owns, so the shape check is what
    // tells them apart — a file saying "draw only these" is not one owning them.
    const result = spaceFileSchema.safeParse({
      ...validSpaceFile,
      layouts: [{ ...working, graphs: ['00000000-0000-4000-8000-000000000011'] }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a key the layout does not declare, rather than stripping it', () => {
    const result = spaceFileSchema.safeParse({
      ...validSpaceFile,
      layouts: [{ ...working, hidden: ['00000000-0000-4000-8000-000000000011'] }],
    });
    expect(result.success).toBe(false);
  });

  it('parses the graph a layout opens active', () => {
    const file = spaceFileSchema.parse({
      ...validSpaceFile,
      layouts: [{ ...working, activeGraph: '00000000-0000-4000-8000-000000000012' }],
    });
    expect(file.layouts?.[0]?.activeGraph).toBe('00000000-0000-4000-8000-000000000012');
  });

  it('leaves it absent — the first graph is active', () => {
    // Absent is the meaningful case, not a missing field to be filled in: it is
    // how a layout defers the active graph (ADR 0026).
    const file = spaceFileSchema.parse({ ...validSpaceFile, layouts: [working] });
    expect(file.layouts?.[0]?.activeGraph).toBeUndefined();
  });

  it('rejects an activeGraph that is not an id', () => {
    expect(
      spaceFileSchema.safeParse({
        ...validSpaceFile,
        layouts: [{ ...working, activeGraph: '' }],
      }).success,
    ).toBe(false);
  });

  it('accepts an activeGraph no graph has — resolution is a reference check', () => {
    // Shape only, as everywhere here. That it names a real graph needs the whole
    // space in view (@project/graph).
    const file = spaceFileSchema.parse({
      ...validSpaceFile,
      layouts: [{ ...working, activeGraph: '00000000-0000-4000-8000-000000000099' }],
    });
    expect(file.layouts?.[0]?.activeGraph).toBe('00000000-0000-4000-8000-000000000099');
  });

  it('accepts defaultRenderer as a durable Space View id', () => {
    // Shape only: whether the name resolves is a reference check, since it needs
    // the declared layouts in view.
    const file = spaceFileSchema.parse({
      ...validSpaceFile,
      defaultRenderer: '00000000-0000-4000-8000-000000000010',
    });
    expect(file.defaultRenderer).toBe('00000000-0000-4000-8000-000000000010');
    expect(spaceFileSchema.safeParse({ ...validSpaceFile, defaultRenderer: 'flow' }).success).toBe(
      false,
    );
  });
});

describe('built-in view ids', () => {
  it('names the automatic views a space can open in without declaring one', () => {
    expect([...COMPUTED_VIEW_IDS]).toEqual([FLOW_SPACE_VIEW_ID, GRID_SPACE_VIEW_ID]);
  });

  it('recognises exactly those names', () => {
    expect(isComputedViewId(FLOW_SPACE_VIEW_ID)).toBe(true);
    expect(isComputedViewId(GRID_SPACE_VIEW_ID)).toBe(true);
    expect(isComputedViewId(uuidSchema.parse('00000000-0000-4000-8000-000000000010'))).toBe(false);
  });
});
