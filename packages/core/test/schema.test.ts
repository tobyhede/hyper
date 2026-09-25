import { describe, expect, it } from 'vitest';
import type { ZodIssue } from 'zod';
import {
  EDGE_TITLE_ONE_LINE,
  graphEdgeSchema,
  resourceFrontmatterSchema,
  resourceSchema,
  spaceFileSchema,
} from '../src/index';

const MAIN = {
  id: '00000000-0000-4000-8000-000000000004',
  title: 'Main',
  edges: [
    { from: '00000000-0000-4000-8000-000000000002', to: '00000000-0000-4000-8000-000000000003' },
  ],
};

/** The Map that owns `MAIN`; positions are its Resource membership (ADR 0040). */
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
  maps: [WORKING],
};

/** A map carrying one graph, for cases that vary only the graph. */
const withGraphs = (graphs: unknown[]) => ({
  ...validSpaceFile,
  maps: [{ ...WORKING, graphs }],
});

describe('space file schema', () => {
  it('nests a Graph under the Map that owns it, with no Space-level collection', () => {
    // A Graph is an owned value of one Map, so a parsed file has no Space-level
    // array. A file carrying one is rejected rather than half-read — by
    // `loadSpace`, not here: declaring the key in this schema would put it in
    // the inferred document type the HTTP contract is checked against. The
    // rejection is a pre-parse check beside the version answer; `space.test.ts`
    // covers it.
    const file = spaceFileSchema.parse({
      version: 1,
      id: '00000000-0000-4000-8000-000000000001',
      title: 'Test deck',
      maps: [
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
    expect(file.maps?.[0]?.graphs.map((graph) => graph.title)).toEqual(['Main']);
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
    expect(file.maps?.[0]?.graphs).toHaveLength(1);
  });

  it('rejects an undeclared key rather than opening on a Map its author did not name', () => {
    // Stripped rather than refused, a file naming its opening Map under a key
    // the schema does not declare reaches `workingSpace`, which adopts
    // `maps[0]` and commits it — the author's stated Map silently
    // replaced and then written back.
    //
    // The key below is arbitrary on purpose. Rejection is by policy and not by
    // name, so neither the schema nor this test spells a particular key; a test
    // that did would be the codebase carrying knowledge of a shape that cannot
    // reach it, which is what ADR 0056 forbids.
    const result = spaceFileSchema.safeParse({
      ...validSpaceFile,
      undeclaredKey: '00000000-0000-4000-8000-000000000010',
    });
    expect(result.success).toBe(false);
  });

  it('holds no resources — a resource exists because its file does (ADR 0020)', () => {
    // Strict, so the array is refused rather than dropped, and nothing can
    // half-load from it.
    const result = spaceFileSchema.safeParse({
      ...validSpaceFile,
      resources: [
        { id: '00000000-0000-4000-8000-000000000002', title: 'A', content: 'resources/a.md' },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects version 2, which put the graphs beside the maps instead of in them', () => {
    // The disposable pre-release shape. Hyper is unreleased, so it has no
    // compatibility claim on the first-public one and is rejected, not migrated
    // (ADR 0040). `loadSpace` says so in one error; here it is the literal.
    const result = spaceFileSchema.safeParse({
      version: 2,
      id: '00000000-0000-4000-8000-000000000001',
      title: 'Old space',
      graphs: [MAIN],
      maps: [
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
      maps: [
        {
          id: 'working',
          title: 'Working',
          positions: { a: { x: 0, y: 0, open: false } },
          graphs: [{ id: 'main', title: 'Main', edges: [{ from: 'a', to: 'b' }] }],
        },
      ],
      defaultMap: 'working',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a top-level edges array, which graphs replaced', () => {
    // A top-level `edges` array is not part of the document; a graph's own
    // `edges` are a different concept that happens to share the word. A file
    // carrying one is refused rather than read past.
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

  it('accepts a space file with no maps — a new space has no structure yet', () => {
    // It renders; it cannot be presented (ADR 0015). A Map owns at least one
    // Graph, so having no Maps is what having no Graphs is.
    const { maps: _maps, ...withoutMaps } = validSpaceFile;
    expect(spaceFileSchema.safeParse(withoutMaps).success).toBe(true);
    expect(spaceFileSchema.safeParse({ ...validSpaceFile, maps: [] }).success).toBe(true);
  });

  it('rejects a map that owns no graphs — one is the fewest it is created with', () => {
    // Creating a Map creates its initial Graph in the same Edit, and Graph
    // management cannot delete the last (ADR 0040), so none is a state no
    // gesture produces.
    expect(spaceFileSchema.safeParse(withGraphs([])).success).toBe(false);
  });

  it('requires the graphs key on a map, so a dropped array is a shape error', () => {
    const { graphs: _graphs, ...withoutGraphs } = WORKING;
    expect(spaceFileSchema.safeParse({ ...validSpaceFile, maps: [withoutGraphs] }).success).toBe(
      false,
    );
  });

  it('accepts a graph with no edges — a Map mints its initial Graph empty', () => {
    // Creating a Map creates its initial empty Active Graph in the same Edit
    // (ADR 0040), so an edge-less Graph is a state the product produces.
    // Deleting the last Edge of a Graph leaves the same shape.
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

describe('resource frontmatter schema', () => {
  it('rejects an empty resource id', () => {
    expect(resourceFrontmatterSchema.safeParse({ id: '', title: 'A' }).success).toBe(false);
  });

  it('defaults a resource with no kind to markdown, so the common resource declares neither', () => {
    const resource = resourceFrontmatterSchema.parse({
      id: '00000000-0000-4000-8000-000000000002',
      title: 'A',
    });
    expect(resource.kind).toBe('markdown');
  });

  it('holds no content key — the file the frontmatter sits in is the content', () => {
    const resource = resourceFrontmatterSchema.parse({
      id: '00000000-0000-4000-8000-000000000002',
      title: 'A',
      content: 'resources/a.md',
    });
    expect('content' in resource).toBe(false);
  });

  it('parses a reference resource, which points at a target instead of holding content', () => {
    const reference = resourceFrontmatterSchema.parse({
      id: '00000000-0000-4000-8000-000000000007',
      title: 'A, again',
      kind: 'reference',
      target: '00000000-0000-4000-8000-000000000002',
    });
    expect(reference.kind).toBe('reference');
    expect(reference.kind === 'reference' && reference.target).toBe(
      '00000000-0000-4000-8000-000000000002',
    );
  });

  it('gives a reference resource no body field at all', () => {
    const reference = resourceSchema.parse({
      id: '00000000-0000-4000-8000-000000000007',
      title: 'A, again',
      kind: 'reference',
      target: '00000000-0000-4000-8000-000000000002',
    });

    expect('body' in reference).toBe(false);
  });

  it('parses a Space Resource that names both the Map and the Graph it selects', () => {
    const selected = resourceFrontmatterSchema.parse({
      id: '00000000-0000-4000-8000-000000000006',
      title: 'Nested space',
      kind: 'space',
      spaceId: '00000000-0000-4000-8000-000000000007',
      map: '00000000-0000-4000-8000-000000000008',
      graph: '00000000-0000-4000-8000-000000000009',
    });

    expect(selected).toMatchObject({
      kind: 'space',
      map: '00000000-0000-4000-8000-000000000008',
      graph: '00000000-0000-4000-8000-000000000009',
    });
  });

  /**
   * The selection is part of what a Space Resource **is**, not an option on it
   * (ADR 0079). A Space Resource names a Map of its target and a Graph that
   * Map owns from the moment it exists: creating one against a mapless
   * target initializes that target first and stores what initialization mints,
   * and `spaceFileSchema` already guarantees every Map owns at least one
   * Graph, so there is always a pair to name. That leaves the schema with no
   * shape for an unmade choice — an absent `map` or `graph` is malformed
   * frontmatter rather than a Resource inheriting its target's opening selection.
   */
  it('rejects a Space Resource that leaves either half of its selection unwritten', () => {
    const nested = {
      id: '00000000-0000-4000-8000-000000000010',
      title: 'Nested space',
      kind: 'space',
      spaceId: '00000000-0000-4000-8000-000000000007',
    };
    const map = '00000000-0000-4000-8000-000000000008';
    const graph = '00000000-0000-4000-8000-000000000009';

    expect(resourceFrontmatterSchema.safeParse(nested).success).toBe(false);
    expect(resourceFrontmatterSchema.safeParse({ ...nested, map }).success).toBe(false);
    expect(resourceFrontmatterSchema.safeParse({ ...nested, graph }).success).toBe(false);
  });

  it('rejects a reference resource with no target', () => {
    expect(
      resourceFrontmatterSchema.safeParse({
        id: '00000000-0000-4000-8000-000000000002',
        title: 'A',
        kind: 'reference',
      }).success,
    ).toBe(false);
  });

  it('does not make Description part of the shared Resource contract', () => {
    const resource = resourceFrontmatterSchema.parse({
      id: '00000000-0000-4000-8000-000000000002',
      title: 'A',
      description: 'What A is',
    });
    expect('description' in resource).toBe(false);
  });
});

describe('space file maps', () => {
  const working = WORKING;

  it('parses a file that declares no maps — the hand-authored case', () => {
    const { maps: _maps, ...withoutMaps } = validSpaceFile;
    const file = spaceFileSchema.parse(withoutMaps);
    expect(file.maps).toBeUndefined();
    expect(file.defaultMap).toBeUndefined();
  });

  it('parses a positioned map and its positions', () => {
    const file = spaceFileSchema.parse({ ...validSpaceFile, maps: [working] });
    const map = file.maps?.[0];
    expect(map?.kind).toBe('positioned');
    expect(map?.positions).toEqual({
      '00000000-0000-4000-8000-000000000002': { x: 0, y: 0, open: false },
      '00000000-0000-4000-8000-000000000003': { x: 320, y: -40, open: false },
    });
  });

  describe('non-finite geometry', () => {
    const A = '00000000-0000-4000-8000-000000000002';
    interface Placement {
      x: number;
      y: number;
      open: boolean;
      openSize?: { width: number; height: number };
    }
    const parsePlacement = (placement: Placement) =>
      spaceFileSchema.safeParse({
        ...validSpaceFile,
        maps: [{ ...working, positions: { ...working.positions, [A]: placement } }],
      }).success;

    it.each([Infinity, -Infinity, NaN])('rejects a coordinate of %s', (value) => {
      expect(parsePlacement({ x: value, y: 0, open: false })).toBe(false);
      expect(parsePlacement({ x: 0, y: value, open: false })).toBe(false);
    });

    it.each([Infinity, NaN])('rejects an Open Size dimension of %s', (value) => {
      expect(
        parsePlacement({ x: 0, y: 0, open: true, openSize: { width: value, height: 146 } }),
      ).toBe(false);
      expect(
        parsePlacement({ x: 0, y: 0, open: true, openSize: { width: 260, height: value } }),
      ).toBe(false);
      expect(
        parsePlacement({ x: 0, y: 0, open: false, openSize: { width: value, height: value } }),
      ).toBe(false);
    });

    it('rejects the infinity a numeric overflow in JSON decodes to', () => {
      const encoded = JSON.stringify({ ...validSpaceFile, maps: [working] }).replace(
        '"x":320',
        '"x":1e400',
      );
      expect(encoded).toContain('1e400');
      const decoded: unknown = JSON.parse(encoded);
      expect(spaceFileSchema.safeParse(decoded).success).toBe(false);
    });

    it('keeps negative coordinates and the minimum Open Size', () => {
      expect(
        parsePlacement({ x: -1e6, y: -0.5, open: true, openSize: { width: 260, height: 146 } }),
      ).toBe(true);
    });

    it('round-trips accepted finite geometry through JSON', () => {
      const file = spaceFileSchema.parse({
        ...validSpaceFile,
        maps: [
          {
            ...working,
            positions: {
              ...working.positions,
              [A]: { x: -12.5, y: 1e300, open: true, openSize: { width: 260, height: 146 } },
            },
          },
        ],
      });
      const decoded: unknown = JSON.parse(JSON.stringify(file));
      expect(spaceFileSchema.parse(decoded)).toEqual(file);
    });
  });

  it('requires an Expanded Resource to be at least the Closed Resource size', () => {
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
        maps: [{ ...working, positions: positions(259, 146) }],
      }).success,
    ).toBe(false);
    expect(
      spaceFileSchema.safeParse({
        ...validSpaceFile,
        maps: [{ ...working, positions: positions(260, 145) }],
      }).success,
    ).toBe(false);
    expect(
      spaceFileSchema.safeParse({
        ...validSpaceFile,
        maps: [{ ...working, positions: positions(260, 146) }],
      }).success,
    ).toBe(true);
  });

  it('defaults a map with no kind to positioned, so one can be hand-written', () => {
    const file = spaceFileSchema.parse({
      ...validSpaceFile,
      maps: [
        {
          id: '00000000-0000-4000-8000-000000000010',
          title: 'Working',
          positions: {},
          graphs: [MAIN],
        },
      ],
    });
    expect(file.maps?.[0]?.kind).toBe('positioned');
  });

  it('accepts an empty position map — positions are sparse, and none is the limit', () => {
    const file = spaceFileSchema.parse({
      ...validSpaceFile,
      maps: [{ ...working, positions: {} }],
    });
    expect(file.maps?.[0]?.positions).toEqual({});
  });

  it('rejects a position that is not a point', () => {
    for (const positions of [
      { '00000000-0000-4000-8000-000000000002': { x: 0 } },
      { '00000000-0000-4000-8000-000000000002': [0, 0] },
      { '00000000-0000-4000-8000-000000000002': { x: '0', y: '0', open: false } },
    ]) {
      expect(
        spaceFileSchema.safeParse({ ...validSpaceFile, maps: [{ ...working, positions }] }).success,
      ).toBe(false);
    }
  });

  it('rejects a position keyed by an empty resource id', () => {
    const result = spaceFileSchema.safeParse({
      ...validSpaceFile,
      maps: [{ ...working, positions: { '': { x: 0, y: 0, open: false } } }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a map kind it does not know', () => {
    const result = spaceFileSchema.safeParse({
      ...validSpaceFile,
      maps: [
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

  it('rejects a map whose graphs are ids rather than owned values', () => {
    // A list of Graph ids shares a key with the collection a map owns, so the
    // shape check is what tells them apart — a file saying "draw only these"
    // is not one owning them.
    const result = spaceFileSchema.safeParse({
      ...validSpaceFile,
      maps: [{ ...working, graphs: ['00000000-0000-4000-8000-000000000011'] }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a key the map does not declare, rather than stripping it', () => {
    const result = spaceFileSchema.safeParse({
      ...validSpaceFile,
      maps: [{ ...working, hidden: ['00000000-0000-4000-8000-000000000011'] }],
    });
    expect(result.success).toBe(false);
  });

  it('parses the graph a map opens active', () => {
    const file = spaceFileSchema.parse({
      ...validSpaceFile,
      maps: [{ ...working, activeGraph: '00000000-0000-4000-8000-000000000012' }],
    });
    expect(file.maps?.[0]?.activeGraph).toBe('00000000-0000-4000-8000-000000000012');
  });

  it('leaves it absent — the first graph is active', () => {
    // Absent is the meaningful case, not a missing field to be filled in: it is
    // how a map defers the active graph (ADR 0026).
    const file = spaceFileSchema.parse({ ...validSpaceFile, maps: [working] });
    expect(file.maps?.[0]?.activeGraph).toBeUndefined();
  });

  it('rejects an activeGraph that is not an id', () => {
    expect(
      spaceFileSchema.safeParse({
        ...validSpaceFile,
        maps: [{ ...working, activeGraph: '' }],
      }).success,
    ).toBe(false);
  });

  it('accepts an activeGraph no graph has — resolution is a reference check', () => {
    // Shape only, as everywhere here. That it names a real graph needs the whole
    // space in view (@project/graph).
    const file = spaceFileSchema.parse({
      ...validSpaceFile,
      maps: [{ ...working, activeGraph: '00000000-0000-4000-8000-000000000099' }],
    });
    expect(file.maps?.[0]?.activeGraph).toBe('00000000-0000-4000-8000-000000000099');
  });

  it('accepts defaultMap as a durable Map id', () => {
    // Shape only: whether the name resolves is a reference check, since it needs
    // the declared maps in view.
    const file = spaceFileSchema.parse({
      ...validSpaceFile,
      defaultMap: '00000000-0000-4000-8000-000000000010',
    });
    expect(file.defaultMap).toBe('00000000-0000-4000-8000-000000000010');
    expect(spaceFileSchema.safeParse({ ...validSpaceFile, defaultMap: 'flow' }).success).toBe(
      false,
    );
  });
});

describe('an Edge Title', () => {
  const ENDPOINTS = {
    from: '00000000-0000-4000-8000-000000000002',
    to: '00000000-0000-4000-8000-000000000003',
  };

  /** Whether a refusal carries the domain's identity for a Title with a line break. */
  const refusesLineBreak = (issues: readonly ZodIssue[]): boolean =>
    issues.some(
      (issue) => issue.code === 'custom' && issue.params?.['code'] === EDGE_TITLE_ONE_LINE,
    );

  it('accepts an untitled Edge — a Title is absent unless authored', () => {
    expect(graphEdgeSchema.parse(ENDPOINTS)).toEqual(ENDPOINTS);
  });

  it('accepts a titled Edge, and a titled Edge whose Title is hidden', () => {
    const titled = { ...ENDPOINTS, title: 'Only on success' };
    expect(graphEdgeSchema.parse(titled)).toEqual(titled);
    const hidden = { ...titled, titleHidden: true };
    expect(graphEdgeSchema.parse(hidden)).toEqual(hidden);
  });

  it('refuses an empty Title — an Edit clears the key rather than storing nothing', () => {
    expect(graphEdgeSchema.safeParse({ ...ENDPOINTS, title: '' }).success).toBe(false);
  });

  it.each([' Why ', 'Why ', ' Why'])('refuses a Title that is not stored trimmed: %j', (title) => {
    expect(graphEdgeSchema.safeParse({ ...ENDPOINTS, title }).success).toBe(false);
  });

  it('accepts a trimmed Title', () => {
    expect(graphEdgeSchema.safeParse({ ...ENDPOINTS, title: 'Why' }).success).toBe(true);
  });

  it.each(['First\nSecond', 'First\rSecond', 'First\r\nSecond', 'Trailing\n'])(
    'refuses a Title with a line break, naming the one-line rule: %j',
    (title) => {
      const result = graphEdgeSchema.safeParse({ ...ENDPOINTS, title });
      expect(result.success).toBe(false);
      expect(refusesLineBreak(result.error?.issues ?? [])).toBe(true);
    },
  );

  it('puts no cap on how long a Title may be', () => {
    const title = 'x'.repeat(10_000);
    expect(graphEdgeSchema.safeParse({ ...ENDPOINTS, title }).success).toBe(true);
  });

  it('refuses titleHidden on an Edge without a Title', () => {
    expect(graphEdgeSchema.safeParse({ ...ENDPOINTS, titleHidden: true }).success).toBe(false);
  });

  it('refuses titleHidden: false — a shown Title stores no key at all', () => {
    expect(
      graphEdgeSchema.safeParse({ ...ENDPOINTS, title: 'Shown', titleHidden: false }).success,
    ).toBe(false);
  });

  it('refuses a key the Edge does not declare, rather than stripping it', () => {
    // A misspelt `titlehidden` would otherwise vanish on the next save.
    expect(
      graphEdgeSchema.safeParse({ ...ENDPOINTS, title: 'Shown', titlehidden: true }).success,
    ).toBe(false);
  });

  it('refuses an Edge carrying an undeclared key inside a space file', () => {
    const result = spaceFileSchema.safeParse(
      withGraphs([
        {
          id: '00000000-0000-4000-8000-000000000004',
          title: 'Main',
          edges: [{ ...ENDPOINTS, label: 'Not the word' }],
        },
      ]),
    );
    expect(result.success).toBe(false);
  });
});
