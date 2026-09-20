import { describe, expect, it } from 'vitest';
import { uuidSchema, type SpaceSnapshot } from '@project/core';
import { loadSpaceAggregate } from '@project/graph';
import type { LoadedSpace } from '../src/backend';
import { MemorySpaceBackend } from '../src/memory';

const META_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const OTHER_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const MISSING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const SPACE_RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const OTHER_MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const OTHER_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000006');
const MISSING_RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000007');
const HIGH_META_ID = uuidSchema.parse('00000000-0000-4000-8000-0000000000ff');
const RESOURCE_ONE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000008');
const RESOURCE_TWO_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000009');

const snapshot = (id = META_ID, title = 'Meta'): SpaceSnapshot => ({
  id,
  document: { version: 1, title },
  resources: [],
});

const loaded = (id = META_ID, revision = 3n): LoadedSpace => ({
  snapshot: snapshot(id),
  revision,
  exportedRevision: null,
});

/**
 * The Space a Space Resource here points at, complete enough to be pointed at.
 *
 * A Space Resource names a Map of its target and a Graph that Map owns
 * (ADR 0079), so a target with no Map is not a Space any valid Space Resource
 * can select — which is why the cases below that link to `OTHER_ID` build it
 * through this rather than through the structureless `snapshot`.
 */
const otherSnapshot = (): SpaceSnapshot => ({
  ...snapshot(OTHER_ID, 'Other'),
  document: {
    version: 1,
    title: 'Other',
    defaultMap: OTHER_MAP_ID,
    maps: [
      {
        id: OTHER_MAP_ID,
        title: 'Map 1',
        kind: 'positioned',
        positions: {},
        graphs: [{ id: OTHER_GRAPH_ID, title: 'Graph 1', edges: [] }],
        activeGraph: OTHER_GRAPH_ID,
      },
    ],
  },
});

const otherLoaded = (revision: bigint): LoadedSpace => ({
  snapshot: otherSnapshot(),
  revision,
  exportedRevision: null,
});

describe('MemorySpaceBackend aggregate persistence', () => {
  it('loads the complete aggregate rooted at the explicit Meta Space', async () => {
    const backend = new MemorySpaceBackend(META_ID, [loaded()]);

    await expect(backend.loadAggregate()).resolves.toEqual({
      kind: 'loaded',
      aggregate: { metaSpaceId: META_ID, spaces: [loaded()] },
    });
  });

  /*
   * `asMeta` is not a guess: in a one-Space aggregate that Space is the only
   * valid Meta, so naming it explicitly and deriving it from the one Space
   * given answer the same aggregate.
   */
  it('asMeta makes the one Space given its own Meta', async () => {
    const backend = MemorySpaceBackend.asMeta(loaded());

    await expect(backend.loadAggregate()).resolves.toEqual({
      kind: 'loaded',
      aggregate: { metaSpaceId: META_ID, spaces: [loaded()] },
    });
  });

  it('answers listSpaces and loadAggregate in ascending id order regardless of seed order', async () => {
    const backend = new MemorySpaceBackend(META_ID, [otherLoaded(6n), loaded()]);

    await expect(backend.listSpaces()).resolves.toEqual([
      { id: META_ID, title: 'Meta' },
      { id: OTHER_ID, title: 'Other' },
    ]);
    await expect(backend.loadAggregate()).resolves.toEqual({
      kind: 'loaded',
      aggregate: { metaSpaceId: META_ID, spaces: [loaded(), otherLoaded(6n)] },
    });
  });

  it('answers loadSpace and loadAggregate with a snapshot’s Resources in ascending id order', async () => {
    const unordered: SpaceSnapshot = {
      ...snapshot(),
      resources: [
        { id: RESOURCE_TWO_ID, document: { title: 'Two', kind: 'markdown', body: 'Two' } },
        { id: RESOURCE_ONE_ID, document: { title: 'One', kind: 'markdown', body: 'One' } },
      ],
    };
    const ordered: SpaceSnapshot = {
      ...unordered,
      resources: [
        { id: RESOURCE_ONE_ID, document: { title: 'One', kind: 'markdown', body: 'One' } },
        { id: RESOURCE_TWO_ID, document: { title: 'Two', kind: 'markdown', body: 'Two' } },
      ],
    };
    const backend = new MemorySpaceBackend(META_ID, [
      { snapshot: unordered, revision: 3n, exportedRevision: null },
    ]);

    await expect(backend.loadSpace(META_ID)).resolves.toEqual({
      snapshot: ordered,
      revision: 3n,
      exportedRevision: null,
    });
    await expect(backend.loadAggregate()).resolves.toEqual({
      kind: 'loaded',
      aggregate: {
        metaSpaceId: META_ID,
        spaces: [{ snapshot: ordered, revision: 3n, exportedRevision: null }],
      },
    });
  });

  /*
   * A conflict's `current` is a stored Space too, and every other read answers
   * its Resources ascending by id (ADR 0078) — the SQL adapters read `current` off
   * the same `orderBy(resource.id.asc())` query as every other read, so a conflict
   * is not a second, unsorted path to the same Space.
   */
  it('answers a conflict’s current Space with its Resources in ascending id order too', async () => {
    const unordered: SpaceSnapshot = {
      ...snapshot(),
      resources: [
        { id: RESOURCE_TWO_ID, document: { title: 'Two', kind: 'markdown', body: 'Two' } },
        { id: RESOURCE_ONE_ID, document: { title: 'One', kind: 'markdown', body: 'One' } },
      ],
    };
    const ordered: SpaceSnapshot = {
      ...unordered,
      resources: [
        { id: RESOURCE_ONE_ID, document: { title: 'One', kind: 'markdown', body: 'One' } },
        { id: RESOURCE_TWO_ID, document: { title: 'Two', kind: 'markdown', body: 'Two' } },
      ],
    };
    const backend = new MemorySpaceBackend(META_ID, [
      { snapshot: unordered, revision: 3n, exportedRevision: null },
    ]);

    await expect(
      backend.commit({
        changes: [
          {
            kind: 'update',
            spaceId: META_ID,
            snapshot: snapshot(META_ID, 'Changed'),
            expectedRevision: 0n,
          },
        ],
      }),
    ).resolves.toEqual({
      kind: 'conflict',
      conflicts: [
        {
          spaceId: META_ID,
          current: { snapshot: ordered, revision: 3n, exportedRevision: null },
        },
      ],
    });
  });

  it('reports every create, update, and delete conflict without changing anything', async () => {
    const backend = new MemorySpaceBackend(META_ID, [loaded()]);

    await expect(
      backend.commit({
        changes: [
          { kind: 'create', spaceId: META_ID, snapshot: snapshot() },
          {
            kind: 'update',
            spaceId: OTHER_ID,
            snapshot: snapshot(OTHER_ID, 'Other'),
            expectedRevision: 0n,
          },
          { kind: 'delete', spaceId: MISSING_ID, expectedRevision: 0n },
        ],
      }),
    ).resolves.toEqual({
      kind: 'conflict',
      conflicts: [
        { spaceId: META_ID, current: loaded() },
        { spaceId: OTHER_ID, current: undefined },
        { spaceId: MISSING_ID, current: undefined },
      ],
    });
    await expect(backend.loadAggregate()).resolves.toEqual({
      kind: 'loaded',
      aggregate: { metaSpaceId: META_ID, spaces: [loaded()] },
    });
  });

  it('rejects a duplicate or mismatched change set as one invalid commit', async () => {
    const backend = new MemorySpaceBackend(META_ID, [loaded()]);
    const invalidRequests: unknown[] = [
      {
        changes: [
          { kind: 'delete', spaceId: META_ID, expectedRevision: 3n },
          { kind: 'delete', spaceId: META_ID, expectedRevision: 3n },
        ],
      },
      {
        changes: [
          { kind: 'update', spaceId: OTHER_ID, snapshot: snapshot(), expectedRevision: 3n },
        ],
      },
    ];

    for (const request of invalidRequests) {
      await expect(
        // @ts-expect-error Runtime validation protects the JavaScript boundary.
        backend.commit(request),
      ).resolves.toMatchObject({ kind: 'permanent-failure', code: 'invalid-commit' });
    }
  });

  it('refuses and rolls back a candidate that fails complete aggregate intake', async () => {
    const backend = new MemorySpaceBackend(META_ID, [loaded()]);

    await expect(
      backend.commit({
        changes: [{ kind: 'delete', spaceId: META_ID, expectedRevision: 3n }],
      }),
    ).resolves.toEqual({
      kind: 'aggregate-refused',
      errors: [{ kind: 'meta-space-missing', metaSpaceId: META_ID }],
    });
    await expect(backend.loadSpace(META_ID)).resolves.toEqual(loaded());
  });

  /*
   * The databases read stored Spaces ascending by id, and an
   * `invalid-space-snapshot` refusal names its Space by that position. A Meta
   * Space inserted first but with the higher id is where insertion order and id
   * order disagree, so this is the case that tells the two apart.
   */
  it('names a refused snapshot by its position in ascending id order', async () => {
    const linkedMeta: SpaceSnapshot = {
      ...snapshot(HIGH_META_ID),
      resources: [
        {
          id: SPACE_RESOURCE_ID,
          document: {
            title: 'Other',
            kind: 'space',
            spaceId: OTHER_ID,
            map: OTHER_MAP_ID,
            graph: OTHER_GRAPH_ID,
          },
        },
      ],
    };
    const dangling: SpaceSnapshot = {
      ...otherSnapshot(),
      document: {
        version: 1,
        title: 'Other',
        defaultMap: OTHER_MAP_ID,
        maps: [
          {
            id: OTHER_MAP_ID,
            title: 'Map 1',
            kind: 'positioned',
            positions: {},
            graphs: [
              {
                id: OTHER_GRAPH_ID,
                title: 'Graph 1',
                edges: [{ from: MISSING_RESOURCE_ID, to: MISSING_RESOURCE_ID }],
              },
            ],
            activeGraph: OTHER_GRAPH_ID,
          },
        ],
      },
    };
    const backend = new MemorySpaceBackend(HIGH_META_ID, [
      { snapshot: linkedMeta, revision: 3n, exportedRevision: null },
      otherLoaded(6n),
    ]);
    const expected = loadSpaceAggregate({
      metaSpaceId: HIGH_META_ID,
      snapshots: [dangling, linkedMeta],
    });
    if (expected.ok) throw new Error('The dangling Edge must fail intake');

    const result = await backend.commit({
      changes: [{ kind: 'update', spaceId: OTHER_ID, snapshot: dangling, expectedRevision: 6n }],
    });

    expect(result).toEqual({ kind: 'aggregate-refused', errors: expected.errors });
    expect(result).toMatchObject({
      kind: 'aggregate-refused',
      errors: [{ kind: 'invalid-space-snapshot', snapshotIndex: 0 }],
    });
    await expect(backend.loadSpace(OTHER_ID)).resolves.toEqual(otherLoaded(6n));
  });

  it('assigns revision zero to a newly created ordinary Space', async () => {
    const backend = new MemorySpaceBackend(META_ID, [loaded()]);
    const linkedMeta: SpaceSnapshot = {
      ...snapshot(),
      resources: [
        {
          id: SPACE_RESOURCE_ID,
          document: {
            title: 'Other',
            kind: 'space',
            spaceId: OTHER_ID,
            map: OTHER_MAP_ID,
            graph: OTHER_GRAPH_ID,
          },
        },
      ],
    };

    await expect(
      backend.commit({
        changes: [
          {
            kind: 'update',
            spaceId: META_ID,
            snapshot: linkedMeta,
            expectedRevision: 3n,
          },
          { kind: 'create', spaceId: OTHER_ID, snapshot: otherSnapshot() },
        ],
      }),
    ).resolves.toEqual({
      kind: 'committed',
      revisions: [
        { spaceId: META_ID, revision: 4n },
        { spaceId: OTHER_ID, revision: 0n },
      ],
      deletedSpaceIds: [],
    });
  });

  it('commits beside an existing imported root Space', async () => {
    const other = loaded(OTHER_ID, 0n);
    const backend = new MemorySpaceBackend(META_ID, [loaded(), other]);

    await expect(
      backend.commit({
        changes: [
          {
            kind: 'update',
            spaceId: META_ID,
            snapshot: snapshot(META_ID, 'Changed'),
            expectedRevision: 3n,
          },
        ],
      }),
    ).resolves.toEqual({
      kind: 'committed',
      revisions: [{ spaceId: META_ID, revision: 4n }],
      deletedSpaceIds: [],
    });
    await expect(backend.loadSpace(OTHER_ID)).resolves.toEqual(other);
  });

  it('conflicts an incomplete deletion when authoritative state still references the Space', async () => {
    const linkedMeta: SpaceSnapshot = {
      ...snapshot(),
      resources: [
        {
          id: SPACE_RESOURCE_ID,
          document: {
            title: 'Other',
            kind: 'space',
            spaceId: OTHER_ID,
            map: OTHER_MAP_ID,
            graph: OTHER_GRAPH_ID,
          },
        },
      ],
    };
    const other = otherLoaded(6n);
    const backend = new MemorySpaceBackend(META_ID, [{ ...loaded(), snapshot: linkedMeta }, other]);

    await expect(
      backend.commit({
        changes: [{ kind: 'delete', spaceId: OTHER_ID, expectedRevision: 6n }],
      }),
    ).resolves.toEqual({
      kind: 'conflict',
      conflicts: [{ spaceId: OTHER_ID, current: other }],
    });
    await expect(backend.loadSpace(OTHER_ID)).resolves.toEqual(other);
  });
});
