import { describe, expect, it } from 'vitest';
import { importSpaceFileSchema, importSpaceSchema, spaceSnapshotSchema } from '../src/index';

const SPACE_ID = '00000000-0000-4000-8000-000000000001';
const RESOURCE_A = '00000000-0000-4000-8000-000000000002';
const RESOURCE_B = '00000000-0000-4000-8000-000000000003';
const GRAPH_ID = '00000000-0000-4000-8000-000000000004';
const MAP_ID = '00000000-0000-4000-8000-000000000005';

const identified = {
  id: SPACE_ID,
  document: {
    version: 1,
    title: 'Test space',
    maps: [
      {
        id: MAP_ID,
        title: 'Working',
        kind: 'positioned' as const,
        positions: {
          [RESOURCE_A]: { x: 0, y: 0, open: false },
          [RESOURCE_B]: { x: 320, y: 0, open: false },
        },
        graphs: [{ id: GRAPH_ID, title: 'Main', edges: [{ from: RESOURCE_A, to: RESOURCE_B }] }],
      },
    ],
    defaultMap: MAP_ID,
  },
  resources: [
    { id: RESOURCE_A, document: { title: 'A', kind: 'markdown' as const, body: 'A' } },
    { id: RESOURCE_B, document: { title: 'B', kind: 'markdown' as const, body: 'B' } },
  ],
};

/** The one map, and the one graph it owns. */
const map = identified.document.maps[0]!;
const graph = map.graphs[0]!;

/** The same aggregate with its one map replaced. */
const withMap = (next: unknown) => ({
  ...identified,
  document: { ...identified.document, maps: [next] },
});

describe('import space schema', () => {
  it('keeps references UUID-only when import entity ids are absent', () => {
    const parsed = importSpaceFileSchema.parse({
      version: 1,
      title: 'Import input',
      maps: [
        {
          title: 'Generated map',
          positions: { [RESOURCE_A]: { x: 0, y: 0, open: false } },
          graphs: [{ title: 'Generated graph', edges: [{ from: RESOURCE_A, to: RESOURCE_B }] }],
        },
      ],
    });

    expect(parsed.id).toBeUndefined();
    expect(parsed.maps?.[0]?.id).toBeUndefined();
    expect(parsed.maps?.[0]?.graphs[0]?.id).toBeUndefined();
    expect(
      importSpaceFileSchema.safeParse({
        ...parsed,
        maps: [
          {
            ...parsed.maps?.[0],
            graphs: [{ title: 'Generated graph', edges: [{ from: 'resource-a', to: RESOURCE_B }] }],
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('allows only entity ids to be absent before identity resolution', () => {
    const input = {
      document: {
        ...identified.document,
        maps: [
          {
            title: 'Working',
            positions: { [RESOURCE_A]: { x: 0, y: 0, open: false } },
            graphs: [{ ...graph, id: undefined }],
          },
        ],
      },
      resources: [
        ...identified.resources,
        { document: { title: 'New', kind: 'markdown', body: '' } },
      ],
    };

    const parsed = importSpaceSchema.parse(input);
    expect(parsed.document.maps?.[0]?.kind).toBe('positioned');
    expect(parsed.id).toBeUndefined();
    expect(parsed.document.maps?.[0]?.id).toBeUndefined();
    expect(parsed.document.maps?.[0]?.graphs[0]?.id).toBeUndefined();
    expect(parsed.resources.at(-1)?.id).toBeUndefined();
  });

  /**
   * The import shape relaxes identity and nothing else. Ownership is not
   * relaxed: a map that names graph *ids* — the version 2 filter, which
   * shares this key — cannot enter through the CLI what the space file rejects,
   * and neither can one owning none.
   */
  it('rejects an imported map whose graphs are ids rather than owned values', () => {
    expect(importSpaceSchema.safeParse(withMap({ ...map, graphs: [GRAPH_ID] })).success).toBe(
      false,
    );
  });

  it('rejects an imported map that owns no graphs', () => {
    expect(importSpaceSchema.safeParse(withMap({ ...map, graphs: [] })).success).toBe(false);
  });

  it('rejects a version 2 document, whose graphs sat beside its maps', () => {
    expect(
      importSpaceSchema.safeParse({
        ...identified,
        document: { ...identified.document, version: 2 },
      }).success,
    ).toBe(false);
  });

  it('rejects a non-UUID whenever an import entity id is explicit', () => {
    for (const input of [
      { ...identified, id: 'space' },
      withMap({ ...map, graphs: [{ ...graph, id: 'main' }] }),
      withMap({ ...map, id: 'working' }),
      { ...identified, resources: [{ ...identified.resources[0], id: 'a' }] },
    ]) {
      expect(importSpaceSchema.safeParse(input).success).toBe(false);
    }
  });
});

describe('space snapshot schema', () => {
  it('requires every entity to be fully identified', () => {
    expect(spaceSnapshotSchema.parse(identified)).toEqual(identified);
    expect(spaceSnapshotSchema.safeParse({ ...identified, id: undefined }).success).toBe(false);
    expect(
      spaceSnapshotSchema.safeParse(withMap({ ...map, graphs: [{ ...graph, id: undefined }] }))
        .success,
    ).toBe(false);
    expect(spaceSnapshotSchema.safeParse(withMap({ ...map, id: undefined })).success).toBe(false);
    expect(
      spaceSnapshotSchema.safeParse({
        ...identified,
        resources: [{ ...identified.resources[0], id: undefined }],
      }).success,
    ).toBe(false);
  });
});
