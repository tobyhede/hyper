import { describe, expect, it, vi } from 'vitest';
import { uuidSchema, type SpaceSnapshot, type UUID } from '@project/core';
import {
  createSpaceSessionRegistry,
  MemorySpaceBackend,
  MemorySpaceBackendTestControl,
  type ObserverErrorReporter,
} from '@project/persistence';
import { GRAPH_PALETTE } from '@project/graph';
import { createSpaceResourceLifecycle } from '../src/space-resource-lifecycle';

/*
 * The three writes are the registry's and are proved in
 * `packages/persistence/test/space-resource-lifecycle.test.ts`, beside the
 * coordination that performs them. What is held here is the pair of reads
 * `app` adds over them, which is where they live (ADR 0076).
 */

/**
 * The observer sink, which nothing here is meant to reach.
 *
 * The epoch's only observers are the surfaces that re-read the Spaces, and none
 * is mounted in this file — so a failure arriving here is a broken test rather
 * than a claim, and rethrowing is how it says so.
 */
const failOnObserverError: ObserverErrorReporter = (error) => {
  throw error;
};

const META_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const META_RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const META_MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const META_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const TARGET_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000010');
const TARGET_RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000011');
const TARGET_MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000012');
const TARGET_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000013');
const SECOND_MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000019');
const SECOND_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-00000000001a');
const THIRD_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-00000000001b');

const metaSnapshot: SpaceSnapshot = {
  id: META_ID,
  document: {
    version: 1,
    title: 'Meta',
    defaultMap: META_MAP_ID,
    maps: [
      {
        id: META_MAP_ID,
        title: 'Map 1',
        kind: 'positioned',
        positions: { [META_RESOURCE_ID]: { x: 0, y: 0, open: false } },
        graphs: [{ id: META_GRAPH_ID, title: 'Graph 1', edges: [] }],
        activeGraph: META_GRAPH_ID,
      },
    ],
  },
  resources: [{ id: META_RESOURCE_ID, document: { title: 'Meta', kind: 'markdown', body: '' } }],
};

const targetSnapshot: SpaceSnapshot = {
  id: TARGET_ID,
  document: {
    version: 1,
    title: 'Architecture',
    defaultMap: TARGET_MAP_ID,
    maps: [
      {
        id: TARGET_MAP_ID,
        title: 'Map 1',
        kind: 'positioned',
        positions: { [TARGET_RESOURCE_ID]: { x: 0, y: 0, open: false } },
        graphs: [{ id: TARGET_GRAPH_ID, title: 'Graph 1', edges: [] }],
        activeGraph: TARGET_GRAPH_ID,
      },
    ],
  },
  resources: [
    { id: TARGET_RESOURCE_ID, document: { title: 'Architecture', kind: 'markdown', body: '' } },
  ],
};

const idSource = (ids: readonly UUID[]) => {
  const remaining = [...ids];
  return () => {
    const id = remaining.shift();
    if (id === undefined) throw new Error('test identity source was exhausted');
    return id;
  };
};

/**
 * The two reads beside the three writes.
 *
 * They are on the same module rather than on a backend because they answer the
 * question the writes do — *which Space, and which of its Maps and Graphs* —
 * and a surface that had to compose its own answer would be deciding twice.
 */
describe('what a Space Resource may reference', () => {
  it('offers every stored Space but the one the Resource would live in', async () => {
    const backend = new MemorySpaceBackend(META_ID, [
      { snapshot: metaSnapshot, revision: 3n, exportedRevision: null },
      { snapshot: targetSnapshot, revision: 7n, exportedRevision: null },
    ]);
    const registry = createSpaceSessionRegistry(backend);
    const lifecycle = createSpaceResourceLifecycle({
      backend,
      registry,
      newId: idSource([]),
      reportObserverError: failOnObserverError,
    });

    // The containing Space is the one target that cannot work whatever else is
    // stored, so it is withheld outright. Every deeper cycle is left to intake,
    // which names the Resources that formed it (ADR 0074).
    await expect(lifecycle.referenceableSpaces(META_ID)).resolves.toEqual([
      { id: TARGET_ID, title: 'Architecture' },
    ]);
    await expect(lifecycle.referenceableSpaces(TARGET_ID)).resolves.toEqual([
      { id: META_ID, title: 'Meta' },
    ]);
  });

  /**
   * The Graphs come back inside the Map that owns them rather than in one
   * list beside it (ADR 0040), because that ownership is the whole reason the
   * Resource's two selections are not independent.
   */
  it('answers a target with each of its Maps and the Graphs that Map owns', async () => {
    const twoMaps: SpaceSnapshot = {
      ...targetSnapshot,
      document: {
        ...targetSnapshot.document,
        maps: [
          ...(targetSnapshot.document.maps ?? []),
          {
            id: SECOND_MAP_ID,
            title: 'Map 2',
            kind: 'positioned',
            positions: { [TARGET_RESOURCE_ID]: { x: 200, y: 0, open: false } },
            graphs: [
              { id: SECOND_GRAPH_ID, title: 'Graph 2', color: '#ff7f0e', edges: [] },
              { id: THIRD_GRAPH_ID, title: 'Graph 3', edges: [] },
            ],
          },
        ],
      },
    };
    const backend = new MemorySpaceBackend(META_ID, [
      { snapshot: metaSnapshot, revision: 3n, exportedRevision: null },
      { snapshot: twoMaps, revision: 7n, exportedRevision: null },
    ]);
    const registry = createSpaceSessionRegistry(backend);
    const lifecycle = createSpaceResourceLifecycle({
      backend,
      registry,
      newId: idSource([]),
      reportObserverError: failOnObserverError,
    });

    await expect(lifecycle.target(TARGET_ID)).resolves.toEqual({
      id: TARGET_ID,
      title: 'Architecture',
      maps: [
        {
          id: TARGET_MAP_ID,
          title: 'Map 1',
          // Each Graph carries the colour its Edges are drawn in, resolved as
          // the canvas resolves it: the stored colour where the Graph has one,
          // the palette's fallback where it has none.
          graphs: [{ id: TARGET_GRAPH_ID, title: 'Graph 1', color: GRAPH_PALETTE[0] }],
          // Carried where the Map authored one, because it is what a Resource
          // pointed at this Map seeds its Graph from (ADR 0026). `Map 2`
          // below authored none and so carries none.
          activeGraph: TARGET_GRAPH_ID,
        },
        {
          id: SECOND_MAP_ID,
          title: 'Map 2',
          graphs: [
            { id: SECOND_GRAPH_ID, title: 'Graph 2', color: '#ff7f0e' },
            { id: THIRD_GRAPH_ID, title: 'Graph 3', color: GRAPH_PALETTE[2] },
          ],
        },
      ],
    });
  });

  /**
   * A Resource can outlive its target between a render and the read behind it, so
   * "gone" is an answer rather than a failure — the Resource still draws, without
   * the context an Open one carries.
   */
  it('answers nothing for a Space the repository does not hold', async () => {
    const backend = new MemorySpaceBackend(META_ID, [
      { snapshot: metaSnapshot, revision: 3n, exportedRevision: null },
    ]);
    const registry = createSpaceSessionRegistry(backend);
    const lifecycle = createSpaceResourceLifecycle({
      backend,
      registry,
      newId: idSource([]),
      reportObserverError: failOnObserverError,
    });

    await expect(lifecycle.target(TARGET_ID)).resolves.toBeUndefined();
  });

  /**
   * A Map authored in a Space this browser also has open is selectable
   * before it has committed, so the read goes through the live session where
   * there is one and falls back to the stored snapshot where there is not.
   */
  it('prefers an open session’s working state to the stored snapshot', async () => {
    const control = new MemorySpaceBackendTestControl();
    // Held open for the whole read, so the two sides genuinely disagree while
    // it happens. Without the gate the commit lands first and the test passes
    // on a stored snapshot that already carries the rename.
    const release = control.deferNextCommit();
    const backend = new MemorySpaceBackend(
      META_ID,
      [
        { snapshot: metaSnapshot, revision: 3n, exportedRevision: null },
        { snapshot: targetSnapshot, revision: 7n, exportedRevision: null },
      ],
      control,
    );
    const registry = createSpaceSessionRegistry(backend);
    const target = registry.open({
      snapshot: targetSnapshot,
      revision: 7n,
      exportedRevision: null,
    });
    const lifecycle = createSpaceResourceLifecycle({
      backend,
      registry,
      newId: idSource([]),
      reportObserverError: failOnObserverError,
    });
    const stored = targetSnapshot.document.maps?.[0];
    if (stored === undefined) throw new Error('the target fixture has no Map to rename');

    target.submit({
      ...targetSnapshot,
      document: {
        ...targetSnapshot.document,
        maps: [{ ...stored, title: 'Renamed before saving' }],
      },
    });

    expect((await backend.loadSpace(TARGET_ID))?.snapshot.document.maps?.[0]?.title).toBe('Map 1');
    await expect(lifecycle.target(TARGET_ID)).resolves.toMatchObject({
      maps: [{ id: TARGET_MAP_ID, title: 'Renamed before saving' }],
    });

    release();
    await vi.waitFor(() => expect(target.getState().persistence.kind).toBe('settled'));
  });
});
