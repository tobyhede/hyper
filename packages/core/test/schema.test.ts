import { describe, expect, it } from 'vitest';
import { cardFrontmatterSchema, cardSchema, spaceFileSchema } from '../src/index';

const MAIN = {
  id: '00000000-0000-4000-8000-000000000004',
  title: 'Main',
  edges: [
    { from: '00000000-0000-4000-8000-000000000002', to: '00000000-0000-4000-8000-000000000003' },
  ],
};

/** The Diagram that owns `MAIN`; positions are its Card membership (ADR 0040). */
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
  diagrams: [WORKING],
};

/** A diagram carrying one graph, for cases that vary only the graph. */
const withGraphs = (graphs: unknown[]) => ({
  ...validSpaceFile,
  diagrams: [{ ...WORKING, graphs }],
});

describe('space file schema', () => {
  it('nests a Graph under the Diagram that owns it, with no Space-level collection', () => {
    // ADR 0040: a Graph is an owned value of one Diagram. The Space-level array
    // is gone, and a file carrying one is rejected rather than half-read — by
    // `loadSpace`, not here. This schema is a plain object, so it *strips* a key
    // it does not declare, and declaring the retired one would put it in the
    // inferred document type the HTTP contract is checked against. The rejection
    // is a pre-parse check beside the version answer; `space.test.ts` covers it.
    const file = spaceFileSchema.parse({
      version: 1,
      id: '00000000-0000-4000-8000-000000000001',
      title: 'Test deck',
      diagrams: [
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
    expect(file.diagrams?.[0]?.graphs.map((graph) => graph.title)).toEqual(['Main']);
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
    expect(file.diagrams?.[0]?.graphs).toHaveLength(1);
  });

  it('rejects an undeclared key rather than opening on a Diagram its author did not name', () => {
    // What answers the opening selection ADR 0079 renamed. Stripped, a file
    // still carrying the old spelling reaches `workingSpace`, which adopts
    // `diagrams[0]` and commits it — the author's stated Diagram silently
    // replaced and then written back.
    //
    // The key below is arbitrary on purpose. Rejection is by policy and not by
    // name, so neither the schema nor this test spells the retired one; a test
    // that did would be the codebase carrying knowledge of a shape that cannot
    // reach it, which is what ADR 0056 forbids.
    const result = spaceFileSchema.safeParse({
      ...validSpaceFile,
      undeclaredKey: '00000000-0000-4000-8000-000000000010',
    });
    expect(result.success).toBe(false);
  });

  it('holds no cards — a card exists because its file does (ADR 0020)', () => {
    // Strict, so the array is refused rather than dropped, and nothing can
    // half-load from it.
    const result = spaceFileSchema.safeParse({
      ...validSpaceFile,
      cards: [{ id: '00000000-0000-4000-8000-000000000002', title: 'A', content: 'cards/a.md' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects version 2, which put the graphs beside the diagrams instead of in them', () => {
    // The disposable pre-release shape. Hyper is unreleased, so it has no
    // compatibility claim on the first-public one and is rejected, not migrated
    // (ADR 0040). `loadSpace` says so in one error; here it is the literal.
    const result = spaceFileSchema.safeParse({
      version: 2,
      id: '00000000-0000-4000-8000-000000000001',
      title: 'Old space',
      graphs: [MAIN],
      diagrams: [
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
      diagrams: [
        {
          id: 'working',
          title: 'Working',
          positions: { a: { x: 0, y: 0, open: false } },
          graphs: [{ id: 'main', title: 'Main', edges: [{ from: 'a', to: 'b' }] }],
        },
      ],
      defaultDiagram: 'working',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a top-level edges array, which graphs replaced', () => {
    // ADR 0007 deleted the structural layer beside graphs; a graph's own `edges`
    // (ADR 0032) are a different thing that happens to share the word. An older
    // file carrying the old array is refused rather than read past.
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
    expect(result.success).toBe(false);
  });

  it('accepts a space file with no diagrams — a new space has no structure yet', () => {
    // ADR 0015. It renders; it cannot be presented. A Diagram owns at least one
    // Graph (ADR 0040), so having no Diagrams is what having no Graphs now is.
    const { diagrams: _diagrams, ...withoutDiagrams } = validSpaceFile;
    expect(spaceFileSchema.safeParse(withoutDiagrams).success).toBe(true);
    expect(spaceFileSchema.safeParse({ ...validSpaceFile, diagrams: [] }).success).toBe(true);
  });

  it('rejects a diagram that owns no graphs — one is the fewest it is created with', () => {
    // Creating a Diagram creates its initial Graph in the same Edit, and Graph
    // management cannot delete the last (ADR 0040), so none is a state no
    // gesture produces.
    expect(spaceFileSchema.safeParse(withGraphs([])).success).toBe(false);
  });

  it('requires the graphs key on a diagram, so a dropped array is a shape error', () => {
    const { graphs: _graphs, ...withoutGraphs } = WORKING;
    expect(
      spaceFileSchema.safeParse({ ...validSpaceFile, diagrams: [withoutGraphs] }).success,
    ).toBe(false);
  });

  it('accepts a graph with no edges — a Diagram mints its initial Graph empty', () => {
    // Creating a Diagram creates its initial empty Active Graph in the same Edit
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

  it('parses a Space Card with optional Diagram and Graph selections', () => {
    const selected = cardFrontmatterSchema.parse({
      id: '00000000-0000-4000-8000-000000000006',
      title: 'Nested space',
      kind: 'space',
      spaceId: '00000000-0000-4000-8000-000000000007',
      diagram: '00000000-0000-4000-8000-000000000008',
      graph: '00000000-0000-4000-8000-000000000009',
    });
    const inherited = cardFrontmatterSchema.parse({
      id: '00000000-0000-4000-8000-000000000010',
      title: 'Nested space with inherited selections',
      kind: 'space',
      spaceId: '00000000-0000-4000-8000-000000000007',
    });

    expect(selected).toMatchObject({
      kind: 'space',
      diagram: '00000000-0000-4000-8000-000000000008',
      graph: '00000000-0000-4000-8000-000000000009',
    });
    expect(inherited).not.toHaveProperty('diagram');
    expect(inherited).not.toHaveProperty('graph');
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

describe('space file diagrams', () => {
  const working = WORKING;

  it('parses a file that declares no diagrams — the hand-authored case', () => {
    const { diagrams: _diagrams, ...withoutDiagrams } = validSpaceFile;
    const file = spaceFileSchema.parse(withoutDiagrams);
    expect(file.diagrams).toBeUndefined();
    expect(file.defaultDiagram).toBeUndefined();
  });

  it('parses a positioned diagram and its positions', () => {
    const file = spaceFileSchema.parse({ ...validSpaceFile, diagrams: [working] });
    const diagram = file.diagrams?.[0];
    expect(diagram?.kind).toBe('positioned');
    expect(diagram?.positions).toEqual({
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
        diagrams: [{ ...working, positions: positions(259, 146) }],
      }).success,
    ).toBe(false);
    expect(
      spaceFileSchema.safeParse({
        ...validSpaceFile,
        diagrams: [{ ...working, positions: positions(260, 145) }],
      }).success,
    ).toBe(false);
    expect(
      spaceFileSchema.safeParse({
        ...validSpaceFile,
        diagrams: [{ ...working, positions: positions(260, 146) }],
      }).success,
    ).toBe(true);
  });

  it('defaults a diagram with no kind to positioned, so one can be hand-written', () => {
    const file = spaceFileSchema.parse({
      ...validSpaceFile,
      diagrams: [
        {
          id: '00000000-0000-4000-8000-000000000010',
          title: 'Working',
          positions: {},
          graphs: [MAIN],
        },
      ],
    });
    expect(file.diagrams?.[0]?.kind).toBe('positioned');
  });

  it('accepts an empty position map — positions are sparse, and none is the limit', () => {
    const file = spaceFileSchema.parse({
      ...validSpaceFile,
      diagrams: [{ ...working, positions: {} }],
    });
    expect(file.diagrams?.[0]?.positions).toEqual({});
  });

  it('rejects a position that is not a point', () => {
    for (const positions of [
      { '00000000-0000-4000-8000-000000000002': { x: 0 } },
      { '00000000-0000-4000-8000-000000000002': [0, 0] },
      { '00000000-0000-4000-8000-000000000002': { x: '0', y: '0', open: false } },
    ]) {
      expect(
        spaceFileSchema.safeParse({ ...validSpaceFile, diagrams: [{ ...working, positions }] })
          .success,
      ).toBe(false);
    }
  });

  it('rejects a position keyed by an empty card id', () => {
    const result = spaceFileSchema.safeParse({
      ...validSpaceFile,
      diagrams: [{ ...working, positions: { '': { x: 0, y: 0, open: false } } }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a diagram kind it does not know', () => {
    const result = spaceFileSchema.safeParse({
      ...validSpaceFile,
      diagrams: [
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

  it('rejects a diagram whose graphs are ids rather than owned values', () => {
    // The version 2 filter, which named the graphs a diagram drew. It shares a
    // key with the collection a diagram now owns, so the shape check is what
    // tells them apart — a file saying "draw only these" is not one owning them.
    const result = spaceFileSchema.safeParse({
      ...validSpaceFile,
      diagrams: [{ ...working, graphs: ['00000000-0000-4000-8000-000000000011'] }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a key the diagram does not declare, rather than stripping it', () => {
    const result = spaceFileSchema.safeParse({
      ...validSpaceFile,
      diagrams: [{ ...working, hidden: ['00000000-0000-4000-8000-000000000011'] }],
    });
    expect(result.success).toBe(false);
  });

  it('parses the graph a diagram opens active', () => {
    const file = spaceFileSchema.parse({
      ...validSpaceFile,
      diagrams: [{ ...working, activeGraph: '00000000-0000-4000-8000-000000000012' }],
    });
    expect(file.diagrams?.[0]?.activeGraph).toBe('00000000-0000-4000-8000-000000000012');
  });

  it('leaves it absent — the first graph is active', () => {
    // Absent is the meaningful case, not a missing field to be filled in: it is
    // how a diagram defers the active graph (ADR 0026).
    const file = spaceFileSchema.parse({ ...validSpaceFile, diagrams: [working] });
    expect(file.diagrams?.[0]?.activeGraph).toBeUndefined();
  });

  it('rejects an activeGraph that is not an id', () => {
    expect(
      spaceFileSchema.safeParse({
        ...validSpaceFile,
        diagrams: [{ ...working, activeGraph: '' }],
      }).success,
    ).toBe(false);
  });

  it('accepts an activeGraph no graph has — resolution is a reference check', () => {
    // Shape only, as everywhere here. That it names a real graph needs the whole
    // space in view (@project/graph).
    const file = spaceFileSchema.parse({
      ...validSpaceFile,
      diagrams: [{ ...working, activeGraph: '00000000-0000-4000-8000-000000000099' }],
    });
    expect(file.diagrams?.[0]?.activeGraph).toBe('00000000-0000-4000-8000-000000000099');
  });

  it('accepts defaultDiagram as a durable Diagram id', () => {
    // Shape only: whether the name resolves is a reference check, since it needs
    // the declared diagrams in view.
    const file = spaceFileSchema.parse({
      ...validSpaceFile,
      defaultDiagram: '00000000-0000-4000-8000-000000000010',
    });
    expect(file.defaultDiagram).toBe('00000000-0000-4000-8000-000000000010');
    expect(spaceFileSchema.safeParse({ ...validSpaceFile, defaultDiagram: 'flow' }).success).toBe(
      false,
    );
  });
});
