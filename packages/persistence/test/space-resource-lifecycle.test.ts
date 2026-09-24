import { describe, expect, it, vi } from 'vitest';
import { uuidSchema, type SpaceSnapshot, type UUID } from '@project/core';
import { nextGraphColor } from '@project/graph';
import { MemorySpaceBackend, MemorySpaceBackendTestControl } from '../src/memory';
import type { SpaceSessionState } from '../src/session';
import { createSpaceSessionRegistry, type SpaceResourceRefusal } from '../src/session-registry';

const META_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const META_RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const META_MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const META_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const TARGET_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000010');
const TARGET_RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000011');
const TARGET_MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000012');
const TARGET_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000013');
const SPACE_RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000014');
const SECOND_SPACE_RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000015');
const CHILD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000016');
const CHILD_RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000017');
const CHILD_LINK_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000018');
const CHILD_MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000019');
const CHILD_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-00000000001a');
const SECOND_TARGET_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-00000000001b');
const DANGLING_TARGET_ID = uuidSchema.parse('00000000-0000-4000-8000-00000000001c');

class ThrowingAggregateBackend extends MemorySpaceBackend {
  throwNextLoad = true;
  readonly thrown = new Error('aggregate transport exploded');

  override loadAggregate(): ReturnType<MemorySpaceBackend['loadAggregate']> {
    if (this.throwNextLoad) {
      this.throwNextLoad = false;
      return Promise.reject(this.thrown);
    }
    return super.loadAggregate();
  }
}

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
  resources: [
    {
      id: META_RESOURCE_ID,
      document: { title: 'Meta', kind: 'markdown', body: '' },
    },
  ],
};

// `toEqual` compares an Error by its message, so identity is read out separately.
const refusalCarries = (
  result: { kind: string; refusal?: SpaceResourceRefusal },
  thrown: Error,
): boolean => result.refusal?.code === 'persistence-read-failed' && result.refusal.cause === thrown;

const faultCarries = (persistence: SpaceSessionState['persistence'], thrown: Error): boolean =>
  persistence.kind === 'rejected' &&
  persistence.failure.code === 'protocol' &&
  persistence.failure.fault.kind === 'coordinated-commit-threw' &&
  persistence.failure.fault.cause === thrown;

const idSource = (ids: readonly UUID[]) => {
  const remaining = [...ids];
  return () => {
    const id = remaining.shift();
    if (id === undefined) throw new Error('test identity source was exhausted');
    return id;
  };
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
    {
      id: TARGET_RESOURCE_ID,
      document: { title: 'Architecture', kind: 'markdown', body: '' },
    },
  ],
};

describe('Space Resource lifecycle', () => {
  it.each(['create', 'link'] as const)(
    'reports a thrown coordination read asynchronously for %s and releases the barrier',
    async (operation) => {
      const sourceSnapshot: SpaceSnapshot =
        operation === 'link'
          ? {
              ...metaSnapshot,
              resources: [
                ...metaSnapshot.resources,
                {
                  id: SECOND_SPACE_RESOURCE_ID,
                  document: {
                    title: 'Existing target',
                    kind: 'space',
                    spaceId: TARGET_ID,
                    map: TARGET_MAP_ID,
                    graph: TARGET_GRAPH_ID,
                  },
                },
              ],
            }
          : metaSnapshot;
      const initial =
        operation === 'link'
          ? [
              { snapshot: sourceSnapshot, revision: 3n, exportedRevision: null },
              { snapshot: targetSnapshot, revision: 7n, exportedRevision: null },
            ]
          : [{ snapshot: sourceSnapshot, revision: 3n, exportedRevision: null }];
      const control = new MemorySpaceBackendTestControl();
      const backend = new ThrowingAggregateBackend(META_ID, initial, control);
      const registry = createSpaceSessionRegistry(backend);
      const meta = registry.open({
        snapshot: sourceSnapshot,
        revision: 3n,
        exportedRevision: null,
      });
      const before = structuredClone(meta.getState());
      const lifecycle = registry.spaceResources(
        idSource(
          operation === 'create'
            ? [TARGET_ID, TARGET_RESOURCE_ID, TARGET_MAP_ID, TARGET_GRAPH_ID, SPACE_RESOURCE_ID]
            : [SPACE_RESOURCE_ID],
        ),
      );

      const result =
        operation === 'create'
          ? await lifecycle.create({
              containingSpaceId: META_ID,
              mapId: META_MAP_ID,
              title: 'Architecture',
              position: { x: 240, y: 80 },
            })
          : await lifecycle.link({
              containingSpaceId: META_ID,
              mapId: META_MAP_ID,
              targetSpaceId: TARGET_ID,
              title: 'Architecture',
              position: { x: 240, y: 80 },
            });

      expect(result).toEqual({
        kind: 'refused',
        refusal: { code: 'persistence-read-failed', cause: backend.thrown },
      });
      expect(refusalCarries(result, backend.thrown)).toBe(true);
      expect(meta.getState()).toEqual(before);
      if (operation === 'create') {
        expect(registry.session(TARGET_ID)).toBeUndefined();
      }
      meta.submit({
        ...meta.getState().working,
        document: { ...meta.getState().working.document, title: 'Retry after read failure' },
      });
      await vi.waitFor(() => expect(meta.getState().persistence.kind).toBe('settled'));
      expect(control.requests).toHaveLength(1);
      expect(control.requests[0]?.changes).toMatchObject([
        {
          kind: 'update',
          spaceId: META_ID,
          snapshot: {
            document: { title: 'Retry after read failure' },
            resources: sourceSnapshot.resources,
          },
        },
      ]);
    },
  );

  it('reports a thrown delete-derivation read asynchronously and releases the barrier', async () => {
    const linkedMeta: SpaceSnapshot = {
      ...metaSnapshot,
      resources: [
        ...metaSnapshot.resources,
        {
          id: SPACE_RESOURCE_ID,
          document: {
            title: 'Target',
            kind: 'space',
            spaceId: TARGET_ID,
            map: TARGET_MAP_ID,
            graph: TARGET_GRAPH_ID,
          },
        },
      ],
      document: {
        ...metaSnapshot.document,
        maps: metaSnapshot.document.maps?.map((map) => ({
          ...map,
          positions: {
            ...map.positions,
            [SPACE_RESOURCE_ID]: { x: 240, y: 80, open: false },
          },
        })),
      },
    };
    const control = new MemorySpaceBackendTestControl();
    const backend = new ThrowingAggregateBackend(
      META_ID,
      [
        { snapshot: linkedMeta, revision: 3n, exportedRevision: null },
        { snapshot: targetSnapshot, revision: 7n, exportedRevision: null },
      ],
      control,
    );
    const registry = createSpaceSessionRegistry(backend);
    const meta = registry.open({ snapshot: linkedMeta, revision: 3n, exportedRevision: null });
    const before = structuredClone(meta.getState());
    const lifecycle = registry.spaceResources(idSource([]));

    const result = await lifecycle.delete({
      containingSpaceId: META_ID,
      resourceId: SPACE_RESOURCE_ID,
    });
    expect(result).toEqual({
      kind: 'refused',
      refusal: { code: 'persistence-read-failed', cause: backend.thrown },
    });
    expect(refusalCarries(result, backend.thrown)).toBe(true);
    expect(meta.getState()).toEqual(before);
    meta.submit({
      ...meta.getState().working,
      document: { ...meta.getState().working.document, title: 'Retry delete' },
    });
    await vi.waitFor(() => expect(meta.getState().persistence.kind).toBe('settled'));
    expect(control.requests).toHaveLength(1);
    expect(control.requests[0]?.changes).toMatchObject([
      {
        kind: 'update',
        spaceId: META_ID,
        snapshot: {
          document: { title: 'Retry delete' },
          resources: linkedMeta.resources,
        },
      },
    ]);
  });

  it('serializes lifecycle installation behind the preceding atomic repository answer', async () => {
    const control = new MemorySpaceBackendTestControl();
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
    const meta = registry.open({ snapshot: metaSnapshot, revision: 3n, exportedRevision: null });
    const lifecycle = registry.spaceResources(
      idSource([SPACE_RESOURCE_ID, SECOND_SPACE_RESOURCE_ID]),
    );

    await lifecycle.link({
      containingSpaceId: META_ID,
      mapId: META_MAP_ID,
      targetSpaceId: TARGET_ID,
      title: 'First',
      position: { x: 240, y: 80 },
    });
    const second = lifecycle.link({
      containingSpaceId: META_ID,
      mapId: META_MAP_ID,
      targetSpaceId: TARGET_ID,
      title: 'Second',
      position: { x: 480, y: 80 },
    });

    expect(meta.getState().working.resources).toHaveLength(2);
    expect(control.requests).toHaveLength(1);
    release();
    await second;
    expect(meta.getState().working.resources).toHaveLength(3);
    await vi.waitFor(() => expect(control.requests).toHaveLength(2));
  });

  it("does not judge a link that changes only Meta against a non-participant's refused local work", async () => {
    const childSnapshot: SpaceSnapshot = {
      id: CHILD_ID,
      document: {
        version: 1,
        title: 'Child',
        defaultMap: CHILD_MAP_ID,
        maps: [
          {
            id: CHILD_MAP_ID,
            title: 'Map 1',
            kind: 'positioned',
            positions: { [CHILD_RESOURCE_ID]: { x: 0, y: 0, open: false } },
            graphs: [{ id: CHILD_GRAPH_ID, title: 'Graph 1', edges: [] }],
            activeGraph: CHILD_GRAPH_ID,
          },
        ],
      },
      resources: [
        { id: CHILD_RESOURCE_ID, document: { title: 'Child', kind: 'markdown', body: '' } },
      ],
    };
    const backend = new MemorySpaceBackend(META_ID, [
      { snapshot: metaSnapshot, revision: 3n, exportedRevision: null },
      { snapshot: targetSnapshot, revision: 7n, exportedRevision: null },
      { snapshot: childSnapshot, revision: 2n, exportedRevision: null },
    ]);
    const registry = createSpaceSessionRegistry(backend);
    const meta = registry.open({ snapshot: metaSnapshot, revision: 3n, exportedRevision: null });
    const child = registry.open({
      snapshot: childSnapshot,
      revision: 2n,
      exportedRevision: null,
    });
    // Child's own local Edit points at a Space nothing names, so its own
    // ordinary commit is refused and it is left `refused` — local work on a
    // Space the link below never touches.
    child.submit({
      ...child.getState().working,
      resources: [
        ...child.getState().working.resources,
        {
          id: CHILD_LINK_ID,
          document: {
            title: 'Unsaved child',
            kind: 'space',
            spaceId: DANGLING_TARGET_ID,
            map: CHILD_MAP_ID,
            graph: CHILD_GRAPH_ID,
          },
        },
      ],
    });
    // Its commit is refused by aggregate intake — a Space Resource whose target
    // does not exist — which is `refused` rather than `rejected`
    // (`v1-release/17`).
    await vi.waitFor(() => expect(child.getState().persistence.kind).toBe('refused'));
    const lifecycle = registry.spaceResources(idSource([SPACE_RESOURCE_ID]));

    await expect(
      lifecycle.link({
        containingSpaceId: META_ID,
        mapId: META_MAP_ID,
        targetSpaceId: TARGET_ID,
        title: 'Link',
        position: { x: 240, y: 80 },
      }),
    ).resolves.toEqual({ kind: 'completed', resourceId: SPACE_RESOURCE_ID });
    expect(meta.getState().working.resources).toHaveLength(2);
    // Child's refused local work is neither consulted nor disturbed by an
    // Edit it does not participate in.
    expect(child.getState().persistence.kind).toBe('refused');
    expect(child.getState().working.resources).toContainEqual(
      expect.objectContaining({ id: CHILD_LINK_ID }),
    );
  });

  it('pauses a session opened while a coordinated repository request is in flight', async () => {
    const control = new MemorySpaceBackendTestControl();
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
    registry.open({ snapshot: metaSnapshot, revision: 3n, exportedRevision: null });
    const lifecycle = registry.spaceResources(idSource([SPACE_RESOURCE_ID]));

    await lifecycle.link({
      containingSpaceId: META_ID,
      mapId: META_MAP_ID,
      targetSpaceId: TARGET_ID,
      title: 'Link',
      position: { x: 240, y: 80 },
    });
    const target = registry.open({
      snapshot: targetSnapshot,
      revision: 7n,
      exportedRevision: null,
    });
    target.submit({
      ...target.getState().working,
      document: { ...target.getState().working.document, title: 'Queued title' },
    });

    expect(control.requests).toHaveLength(1);
    release();
    await vi.waitFor(() => expect(control.requests).toHaveLength(2));
    expect(control.requests[1]?.changes).toMatchObject([
      { kind: 'update', snapshot: { document: { title: 'Queued title' } } },
    ]);
  });

  it.each([
    {
      result: { kind: 'retryable-failure', code: 'network' } as const,
      persistence: 'failed',
      recovery: 'retry',
    },
    {
      result: {
        kind: 'conflict',
        conflicts: [
          {
            spaceId: META_ID,
            current: { snapshot: metaSnapshot, revision: 9n, exportedRevision: null },
          },
        ],
      } as const,
      persistence: 'conflicted',
      recovery: 'resolve-conflict',
    },
  ])(
    'refuses an affected $persistence Space without changing local or backend state',
    async ({ result, persistence, recovery }) => {
      const control = new MemorySpaceBackendTestControl();
      control.queueResult(result);
      const backend = new MemorySpaceBackend(
        META_ID,
        [
          { snapshot: metaSnapshot, revision: 3n, exportedRevision: null },
          { snapshot: targetSnapshot, revision: 7n, exportedRevision: null },
        ],
        control,
      );
      const registry = createSpaceSessionRegistry(backend);
      const meta = registry.open({ snapshot: metaSnapshot, revision: 3n, exportedRevision: null });
      meta.submit(meta.getState().working);
      await vi.waitFor(() => expect(meta.getState().persistence.kind).toBe(persistence));
      const before = structuredClone(meta.getState());
      const lifecycle = registry.spaceResources(idSource([SPACE_RESOURCE_ID]));

      await expect(
        lifecycle.link({
          containingSpaceId: META_ID,
          mapId: META_MAP_ID,
          targetSpaceId: TARGET_ID,
          title: 'Blocked link',
          position: { x: 240, y: 80 },
        }),
      ).resolves.toEqual({
        kind: 'refused',
        refusal: { code: 'persistence-recovery-required', spaceId: META_ID, recovery },
      });
      expect(meta.getState()).toEqual(before);
      expect(control.requests).toHaveLength(1);
    },
  );

  it('gives a participant the conflict never named the baseline it reverts to', async () => {
    const linkedMeta: SpaceSnapshot = {
      ...metaSnapshot,
      resources: [
        ...metaSnapshot.resources,
        {
          id: SPACE_RESOURCE_ID,
          document: {
            title: 'Target',
            kind: 'space',
            spaceId: TARGET_ID,
            map: TARGET_MAP_ID,
            graph: TARGET_GRAPH_ID,
          },
        },
      ],
      document: {
        ...metaSnapshot.document,
        maps: metaSnapshot.document.maps?.map((map) => ({
          ...map,
          positions: {
            ...map.positions,
            [SPACE_RESOURCE_ID]: { x: 240, y: 80, open: false },
          },
        })),
      },
    };
    const control = new MemorySpaceBackendTestControl();
    // The conflict names the cascade's target only. Meta is a participant
    // because the same edit removes its Space Resource, but the repository never
    // complained about it, so it has no remote snapshot of its own.
    control.queueResult({
      kind: 'conflict',
      conflicts: [
        {
          spaceId: TARGET_ID,
          current: { snapshot: targetSnapshot, revision: 9n, exportedRevision: null },
        },
      ],
    });
    const backend = new MemorySpaceBackend(
      META_ID,
      [
        { snapshot: linkedMeta, revision: 3n, exportedRevision: null },
        { snapshot: targetSnapshot, revision: 7n, exportedRevision: null },
      ],
      control,
    );
    const registry = createSpaceSessionRegistry(backend);
    const meta = registry.open({ snapshot: linkedMeta, revision: 3n, exportedRevision: null });
    registry.open({ snapshot: targetSnapshot, revision: 7n, exportedRevision: null });
    const lifecycle = registry.spaceResources(idSource([]));

    await lifecycle.delete({ containingSpaceId: META_ID, resourceId: SPACE_RESOURCE_ID });
    await vi.waitFor(() => expect(meta.getState().persistence.kind).toBe('conflicted'));

    // Meta carries the snapshot it held before the cascade, which is what
    // accepting the stored side reverts it to — the edit never committed, so
    // the baseline *is* what is stored. Without it the surface cannot tell this
    // apart from a Space reported gone, whose recovery is the opposite one.
    expect(meta.getState().persistence).toEqual({
      kind: 'conflicted',
      current: undefined,
      baseline: linkedMeta,
    });
    // The Space the conflict did name keeps its remote snapshot to reload.
    expect(registry.session(TARGET_ID)?.getState().persistence).toMatchObject({
      kind: 'conflicted',
      current: { revision: 9n },
      baseline: undefined,
    });
  });

  it('refuses a deletion cascade when its target Space needs recovery', async () => {
    const linkedMeta: SpaceSnapshot = {
      ...metaSnapshot,
      resources: [
        ...metaSnapshot.resources,
        {
          id: SPACE_RESOURCE_ID,
          document: {
            title: 'Target',
            kind: 'space',
            spaceId: TARGET_ID,
            map: TARGET_MAP_ID,
            graph: TARGET_GRAPH_ID,
          },
        },
      ],
      document: {
        ...metaSnapshot.document,
        maps: metaSnapshot.document.maps?.map((map) => ({
          ...map,
          positions: {
            ...map.positions,
            [SPACE_RESOURCE_ID]: { x: 240, y: 80, open: false },
          },
        })),
      },
    };
    const control = new MemorySpaceBackendTestControl();
    control.queueResult({ kind: 'retryable-failure', code: 'network' });
    const backend = new MemorySpaceBackend(
      META_ID,
      [
        { snapshot: linkedMeta, revision: 3n, exportedRevision: null },
        { snapshot: targetSnapshot, revision: 7n, exportedRevision: null },
      ],
      control,
    );
    const registry = createSpaceSessionRegistry(backend);
    const meta = registry.open({ snapshot: linkedMeta, revision: 3n, exportedRevision: null });
    const target = registry.open({
      snapshot: targetSnapshot,
      revision: 7n,
      exportedRevision: null,
    });
    target.submit(target.getState().working);
    await vi.waitFor(() => expect(target.getState().persistence.kind).toBe('failed'));
    const lifecycle = registry.spaceResources(idSource([]));

    await expect(
      lifecycle.delete({ containingSpaceId: META_ID, resourceId: SPACE_RESOURCE_ID }),
    ).resolves.toEqual({
      kind: 'refused',
      refusal: { code: 'persistence-recovery-required', spaceId: TARGET_ID, recovery: 'retry' },
    });
    expect(meta.getState().working).toEqual(linkedMeta);
    expect(control.requests).toHaveLength(1);
  });

  it.each([
    {
      result: { kind: 'permanent-failure', code: 'invalid-commit' } as const,
      state: 'rejected',
    },
    {
      result: {
        kind: 'conflict',
        conflicts: [
          {
            spaceId: META_ID,
            current: { snapshot: metaSnapshot, revision: 9n, exportedRevision: null },
          },
        ],
      } as const,
      state: 'conflicted',
    },
  ])('publishes one shared $state outcome to every participant', async ({ result, state }) => {
    const control = new MemorySpaceBackendTestControl();
    control.queueResult(result);
    const backend = new MemorySpaceBackend(
      META_ID,
      [{ snapshot: metaSnapshot, revision: 3n, exportedRevision: null }],
      control,
    );
    const registry = createSpaceSessionRegistry(backend);
    const meta = registry.open({ snapshot: metaSnapshot, revision: 3n, exportedRevision: null });
    const mismatchedPublications: string[] = [];
    meta.subscribe(() => {
      const target = registry.session(TARGET_ID);
      if (
        target !== undefined &&
        target.getState().persistence.kind !== meta.getState().persistence.kind
      ) {
        mismatchedPublications.push(
          `${meta.getState().persistence.kind}/${target.getState().persistence.kind}`,
        );
      }
    });
    const lifecycle = registry.spaceResources(
      idSource([TARGET_ID, TARGET_RESOURCE_ID, TARGET_MAP_ID, TARGET_GRAPH_ID, SPACE_RESOURCE_ID]),
    );

    await lifecycle.create({
      containingSpaceId: META_ID,
      mapId: META_MAP_ID,
      title: 'Architecture',
      position: { x: 240, y: 80 },
    });
    await vi.waitFor(() => expect(meta.getState().persistence.kind).toBe(state));

    expect(registry.session(TARGET_ID)?.getState().persistence.kind).toBe(state);
    expect(mismatchedPublications).toEqual([]);
  });

  it('releases the barrier and rejects every participant when the backend throws', async () => {
    const control = new MemorySpaceBackendTestControl();
    const thrown = new Error('transport exploded');
    control.throwNext(thrown);
    const backend = new MemorySpaceBackend(
      META_ID,
      [{ snapshot: metaSnapshot, revision: 3n, exportedRevision: null }],
      control,
    );
    const registry = createSpaceSessionRegistry(backend);
    const meta = registry.open({ snapshot: metaSnapshot, revision: 3n, exportedRevision: null });
    const lifecycle = registry.spaceResources(
      idSource([TARGET_ID, TARGET_RESOURCE_ID, TARGET_MAP_ID, TARGET_GRAPH_ID, SPACE_RESOURCE_ID]),
    );

    await lifecycle.create({
      containingSpaceId: META_ID,
      mapId: META_MAP_ID,
      title: 'Architecture',
      position: { x: 240, y: 80 },
    });
    await vi.waitFor(() => expect(meta.getState().persistence.kind).toBe('rejected'));

    // The thrown value itself is the diagnostic, carried as typed context.
    const rejected = {
      kind: 'rejected',
      failure: {
        kind: 'permanent-failure',
        code: 'protocol',
        fault: { kind: 'coordinated-commit-threw', cause: thrown },
      },
    };
    expect(meta.getState().persistence).toEqual(rejected);
    expect(registry.session(TARGET_ID)?.getState().persistence).toEqual(rejected);
    expect(faultCarries(meta.getState().persistence, thrown)).toBe(true);
  });

  it('names the participant a malformed coordinated result omitted', async () => {
    const control = new MemorySpaceBackendTestControl();
    // Acknowledges the containing Space and says nothing of the created target.
    control.queueResult({
      kind: 'committed',
      revisions: [{ spaceId: META_ID, revision: 4n }],
      deletedSpaceIds: [],
    });
    const backend = new MemorySpaceBackend(
      META_ID,
      [{ snapshot: metaSnapshot, revision: 3n, exportedRevision: null }],
      control,
    );
    const registry = createSpaceSessionRegistry(backend);
    const meta = registry.open({ snapshot: metaSnapshot, revision: 3n, exportedRevision: null });
    const lifecycle = registry.spaceResources(
      idSource([TARGET_ID, TARGET_RESOURCE_ID, TARGET_MAP_ID, TARGET_GRAPH_ID, SPACE_RESOURCE_ID]),
    );

    await lifecycle.create({
      containingSpaceId: META_ID,
      mapId: META_MAP_ID,
      title: 'Architecture',
      position: { x: 240, y: 80 },
    });
    await vi.waitFor(() => expect(meta.getState().persistence.kind).toBe('rejected'));

    const rejected = {
      kind: 'rejected',
      failure: {
        kind: 'permanent-failure',
        code: 'protocol',
        fault: { kind: 'coordinated-result-malformed', omittedSpaceIds: [TARGET_ID] },
      },
    };
    expect(meta.getState().persistence).toEqual(rejected);
    expect(registry.session(TARGET_ID)?.getState().persistence).toEqual(rejected);
  });

  it('accepts stored state across a conflicted create and removes its provisional target', async () => {
    const control = new MemorySpaceBackendTestControl();
    control.queueResult({
      kind: 'conflict',
      conflicts: [
        {
          spaceId: META_ID,
          current: { snapshot: metaSnapshot, revision: 9n, exportedRevision: null },
        },
      ],
    });
    const backend = new MemorySpaceBackend(
      META_ID,
      [{ snapshot: metaSnapshot, revision: 3n, exportedRevision: null }],
      control,
    );
    const registry = createSpaceSessionRegistry(backend);
    const meta = registry.open({ snapshot: metaSnapshot, revision: 3n, exportedRevision: null });
    const lifecycle = registry.spaceResources(
      idSource([TARGET_ID, TARGET_RESOURCE_ID, TARGET_MAP_ID, TARGET_GRAPH_ID, SPACE_RESOURCE_ID]),
    );

    await lifecycle.create({
      containingSpaceId: META_ID,
      mapId: META_MAP_ID,
      title: 'Architecture',
      position: { x: 240, y: 80 },
    });
    await vi.waitFor(() => expect(meta.getState().persistence.kind).toBe('conflicted'));
    registry.session(TARGET_ID)?.acceptRemote();

    expect(meta.getState()).toMatchObject({
      working: metaSnapshot,
      acknowledgedRevision: 9n,
      persistence: { kind: 'settled' },
    });
    expect(registry.session(TARGET_ID)).toBeUndefined();
  });

  it('keeps local state across every conflicted participant with one action', async () => {
    const control = new MemorySpaceBackendTestControl();
    control.queueResult({
      kind: 'conflict',
      conflicts: [
        {
          spaceId: META_ID,
          current: { snapshot: metaSnapshot, revision: 9n, exportedRevision: null },
        },
      ],
    });
    const backend = new MemorySpaceBackend(
      META_ID,
      [{ snapshot: metaSnapshot, revision: 3n, exportedRevision: null }],
      control,
    );
    const registry = createSpaceSessionRegistry(backend);
    const meta = registry.open({ snapshot: metaSnapshot, revision: 3n, exportedRevision: null });
    const lifecycle = registry.spaceResources(
      idSource([TARGET_ID, TARGET_RESOURCE_ID, TARGET_MAP_ID, TARGET_GRAPH_ID, SPACE_RESOURCE_ID]),
    );
    await lifecycle.create({
      containingSpaceId: META_ID,
      mapId: META_MAP_ID,
      title: 'Architecture',
      position: { x: 240, y: 80 },
    });
    await vi.waitFor(() => expect(meta.getState().persistence.kind).toBe('conflicted'));
    control.queueResult({
      kind: 'committed',
      revisions: [
        { spaceId: META_ID, revision: 10n },
        { spaceId: TARGET_ID, revision: 0n },
      ],
      deletedSpaceIds: [],
    });

    const target = registry.session(TARGET_ID);
    if (target === undefined) throw new Error('target session was not installed');
    target.resolveConflict(target.getState().working);
    await vi.waitFor(() => expect(meta.getState().persistence.kind).toBe('settled'));
    expect(registry.session(TARGET_ID)?.getState().persistence.kind).toBe('settled');
    expect(control.requests).toHaveLength(2);
  });

  it('keeps a colliding created Space by retrying it as an update', async () => {
    const control = new MemorySpaceBackendTestControl();
    const backend = new MemorySpaceBackend(
      META_ID,
      [
        { snapshot: metaSnapshot, revision: 3n, exportedRevision: null },
        { snapshot: targetSnapshot, revision: 7n, exportedRevision: null },
      ],
      control,
    );
    const registry = createSpaceSessionRegistry(backend);
    const meta = registry.open({ snapshot: metaSnapshot, revision: 3n, exportedRevision: null });
    const lifecycle = registry.spaceResources(
      idSource([TARGET_ID, TARGET_RESOURCE_ID, TARGET_MAP_ID, TARGET_GRAPH_ID, SPACE_RESOURCE_ID]),
    );
    await lifecycle.create({
      containingSpaceId: META_ID,
      mapId: META_MAP_ID,
      title: 'Replacement',
      position: { x: 240, y: 80 },
    });
    await vi.waitFor(() => expect(meta.getState().persistence.kind).toBe('conflicted'));
    control.queueResult({
      kind: 'committed',
      revisions: [
        { spaceId: META_ID, revision: 4n },
        { spaceId: TARGET_ID, revision: 8n },
      ],
      deletedSpaceIds: [],
    });
    const target = registry.session(TARGET_ID);
    if (target === undefined) throw new Error('target session was not installed');

    target.resolveConflict(target.getState().working);
    target.resolveConflict(target.getState().working);
    await vi.waitFor(() => expect(meta.getState().persistence.kind).toBe('settled'));

    expect(control.requests).toHaveLength(2);
    expect(control.requests[1]?.changes).toMatchObject([
      { kind: 'update', spaceId: META_ID },
      { kind: 'update', spaceId: TARGET_ID, expectedRevision: 7n },
    ]);
  });

  it('restores a colliding created Space to its stored copy when a later conflict is accepted', async () => {
    const control = new MemorySpaceBackendTestControl();
    const backend = new MemorySpaceBackend(
      META_ID,
      [
        { snapshot: metaSnapshot, revision: 3n, exportedRevision: null },
        { snapshot: targetSnapshot, revision: 7n, exportedRevision: null },
      ],
      control,
    );
    const registry = createSpaceSessionRegistry(backend);
    const meta = registry.open({ snapshot: metaSnapshot, revision: 3n, exportedRevision: null });
    const lifecycle = registry.spaceResources(
      idSource([TARGET_ID, TARGET_RESOURCE_ID, TARGET_MAP_ID, TARGET_GRAPH_ID, SPACE_RESOURCE_ID]),
    );
    await lifecycle.create({
      containingSpaceId: META_ID,
      mapId: META_MAP_ID,
      title: 'Replacement',
      position: { x: 240, y: 80 },
    });
    await vi.waitFor(() => expect(meta.getState().persistence.kind).toBe('conflicted'));
    // The replay of the kept Space conflicts on Meta alone.
    control.queueResult({
      kind: 'conflict',
      conflicts: [
        {
          spaceId: META_ID,
          current: { snapshot: metaSnapshot, revision: 9n, exportedRevision: null },
        },
      ],
    });
    const target = registry.session(TARGET_ID);
    if (target === undefined) throw new Error('target session was not installed');
    target.resolveConflict(target.getState().working);
    await vi.waitFor(() => expect(control.requests).toHaveLength(2));
    await vi.waitFor(() => expect(target.getState().persistence.kind).toBe('conflicted'));

    target.acceptRemote();

    expect(meta.getState()).toMatchObject({
      working: metaSnapshot,
      acknowledgedRevision: 9n,
      persistence: { kind: 'settled' },
    });
    expect(registry.session(TARGET_ID)?.getState()).toMatchObject({
      working: targetSnapshot,
      acknowledgedRevision: 7n,
      persistence: { kind: 'settled' },
    });
  });

  it('keeps a locally updated Space deleted remotely by retrying it as a create', async () => {
    const control = new MemorySpaceBackendTestControl();
    control.queueResult({
      kind: 'conflict',
      conflicts: [{ spaceId: META_ID, current: undefined }],
    });
    const backend = new MemorySpaceBackend(
      META_ID,
      [
        { snapshot: metaSnapshot, revision: 3n, exportedRevision: null },
        { snapshot: targetSnapshot, revision: 7n, exportedRevision: null },
      ],
      control,
    );
    const registry = createSpaceSessionRegistry(backend);
    const meta = registry.open({ snapshot: metaSnapshot, revision: 3n, exportedRevision: null });
    const lifecycle = registry.spaceResources(idSource([SPACE_RESOURCE_ID]));
    await lifecycle.link({
      containingSpaceId: META_ID,
      mapId: META_MAP_ID,
      targetSpaceId: TARGET_ID,
      title: 'Target',
      position: { x: 240, y: 80 },
    });
    await vi.waitFor(() => expect(meta.getState().persistence.kind).toBe('conflicted'));
    control.queueResult({
      kind: 'committed',
      revisions: [{ spaceId: META_ID, revision: 0n }],
      deletedSpaceIds: [],
    });

    meta.resolveConflict(meta.getState().working);
    await vi.waitFor(() => expect(meta.getState().persistence.kind).toBe('settled'));

    expect(control.requests[1]?.changes).toMatchObject([{ kind: 'create', spaceId: META_ID }]);
  });

  it('accepts a remote deletion by evicting the absent participant session', async () => {
    const control = new MemorySpaceBackendTestControl();
    control.queueResult({
      kind: 'conflict',
      conflicts: [{ spaceId: META_ID, current: undefined }],
    });
    const backend = new MemorySpaceBackend(
      META_ID,
      [
        { snapshot: metaSnapshot, revision: 3n, exportedRevision: null },
        { snapshot: targetSnapshot, revision: 7n, exportedRevision: null },
      ],
      control,
    );
    const registry = createSpaceSessionRegistry(backend);
    const meta = registry.open({ snapshot: metaSnapshot, revision: 3n, exportedRevision: null });
    const lifecycle = registry.spaceResources(idSource([SPACE_RESOURCE_ID]));
    await lifecycle.link({
      containingSpaceId: META_ID,
      mapId: META_MAP_ID,
      targetSpaceId: TARGET_ID,
      title: 'Target',
      position: { x: 240, y: 80 },
    });
    await vi.waitFor(() => expect(meta.getState().persistence.kind).toBe('conflicted'));

    meta.acceptRemote();

    expect(registry.session(META_ID)).toBeUndefined();
  });

  it('retries every participant together with later local work', async () => {
    const control = new MemorySpaceBackendTestControl();
    control.queueResult({ kind: 'retryable-failure', code: 'network' });
    const backend = new MemorySpaceBackend(
      META_ID,
      [{ snapshot: metaSnapshot, revision: 3n, exportedRevision: null }],
      control,
    );
    const registry = createSpaceSessionRegistry(backend);
    const meta = registry.open({ snapshot: metaSnapshot, revision: 3n, exportedRevision: null });
    const lifecycle = registry.spaceResources(
      idSource([TARGET_ID, TARGET_RESOURCE_ID, TARGET_MAP_ID, TARGET_GRAPH_ID, SPACE_RESOURCE_ID]),
    );

    await lifecycle.create({
      containingSpaceId: META_ID,
      mapId: META_MAP_ID,
      title: 'Architecture',
      position: { x: 240, y: 80 },
    });
    await vi.waitFor(() => expect(meta.getState().persistence.kind).toBe('failed'));
    const target = registry.session(TARGET_ID);
    expect(target?.getState().persistence.kind).toBe('failed');
    meta.submit({
      ...meta.getState().working,
      document: { ...meta.getState().working.document, title: 'Later local title' },
    });

    control.queueResult({
      kind: 'committed',
      revisions: [
        { spaceId: META_ID, revision: 4n },
        { spaceId: TARGET_ID, revision: 0n },
      ],
      deletedSpaceIds: [],
    });
    target?.retry();
    await vi.waitFor(() => expect(meta.getState().persistence.kind).toBe('settled'));

    expect(control.requests).toHaveLength(2);
    expect(control.requests[1]?.changes).toMatchObject([
      { kind: 'update', snapshot: { document: { title: 'Later local title' } } },
      { kind: 'create', spaceId: TARGET_ID },
    ]);
    expect(target?.getState().persistence.kind).toBe('settled');
  });

  it('reattempts a permanently rejected coordinated edit with every original participant', async () => {
    const control = new MemorySpaceBackendTestControl();
    control.queueResult({ kind: 'permanent-failure', code: 'forbidden' });
    const backend = new MemorySpaceBackend(
      META_ID,
      [{ snapshot: metaSnapshot, revision: 3n, exportedRevision: null }],
      control,
    );
    const registry = createSpaceSessionRegistry(backend);
    const meta = registry.open({ snapshot: metaSnapshot, revision: 3n, exportedRevision: null });
    const lifecycle = registry.spaceResources(
      idSource([TARGET_ID, TARGET_RESOURCE_ID, TARGET_MAP_ID, TARGET_GRAPH_ID, SPACE_RESOURCE_ID]),
    );
    await lifecycle.create({
      containingSpaceId: META_ID,
      mapId: META_MAP_ID,
      title: 'Architecture',
      position: { x: 240, y: 80 },
    });
    await vi.waitFor(() => expect(meta.getState().persistence.kind).toBe('rejected'));
    control.queueResult({
      kind: 'committed',
      revisions: [
        { spaceId: META_ID, revision: 4n },
        { spaceId: TARGET_ID, revision: 0n },
      ],
      deletedSpaceIds: [],
    });

    meta.submit({
      ...meta.getState().working,
      document: { ...meta.getState().working.document, title: 'Newest Meta' },
    });
    await vi.waitFor(() => expect(meta.getState().persistence.kind).toBe('settled'));

    expect(control.requests[1]?.changes).toMatchObject([
      { kind: 'update', snapshot: { document: { title: 'Newest Meta' } } },
      { kind: 'create', spaceId: TARGET_ID },
    ]);
  });

  /*
   * `v1-release/17`, criterion 4: the backend itself refuses the coordinated
   * aggregate — not the client-side pre-flight `loadSpaceAggregate` check
   * `coordinateSpaceResourceLifecycle` runs before ever calling `backend.commit`.
   * The candidate this builds (a fresh Target Space linked from Meta) passes
   * that local check cleanly, so the queued `aggregate-refused` can only be
   * answered by the mocked backend — mirroring a real repository's own
   * aggregate-intake refusal on the commit path, e.g. a concurrent Edit that
   * made the candidate invalid between the read and the write.
   *
   * Every participant the coordinated commit touched — Meta and the newly
   * created Target alike — must observe the same completed `refused` state,
   * and neither the standalone `retry()` nor `coordinatedRecovery.retry()`
   * gets past it: only a further Edit (`submit`) resubmits the aggregate,
   * exactly as the permanent-failure case above recovers.
   */
  it('refuses every participant together when the backend refuses the coordinated aggregate', async () => {
    const control = new MemorySpaceBackendTestControl();
    control.queueResult({
      kind: 'aggregate-refused',
      errors: [{ kind: 'ordinary-space-unreferenced', spaceId: TARGET_ID }],
    });
    const backend = new MemorySpaceBackend(
      META_ID,
      [{ snapshot: metaSnapshot, revision: 3n, exportedRevision: null }],
      control,
    );
    const registry = createSpaceSessionRegistry(backend);
    const meta = registry.open({ snapshot: metaSnapshot, revision: 3n, exportedRevision: null });
    const lifecycle = registry.spaceResources(
      idSource([TARGET_ID, TARGET_RESOURCE_ID, TARGET_MAP_ID, TARGET_GRAPH_ID, SPACE_RESOURCE_ID]),
    );

    await lifecycle.create({
      containingSpaceId: META_ID,
      mapId: META_MAP_ID,
      title: 'Architecture',
      position: { x: 240, y: 80 },
    });
    await vi.waitFor(() => expect(meta.getState().persistence.kind).toBe('refused'));
    const target = registry.session(TARGET_ID);
    expect(target?.getState().persistence.kind).toBe('refused');
    expect(meta.getState().persistence).toMatchObject({
      kind: 'refused',
      failure: {
        kind: 'aggregate-refused',
        errors: [{ kind: 'ordinary-space-unreferenced', spaceId: TARGET_ID }],
      },
    });
    expect(target?.getState().persistence).toEqual(meta.getState().persistence);

    // Retry recovers nothing: it answers only `failed`, and a coordinated
    // refusal is not that.
    const requestsBeforeRetry = control.requests.length;
    meta.retry();
    target?.retry();
    expect(control.requests).toHaveLength(requestsBeforeRetry);
    expect(meta.getState().persistence.kind).toBe('refused');
    expect(target?.getState().persistence.kind).toBe('refused');

    // Recovery is a subsequent, authored Edit: correcting the working Space
    // and submitting resumes the coordinated commit through the ordinary path.
    control.queueResult({
      kind: 'committed',
      revisions: [
        { spaceId: META_ID, revision: 4n },
        { spaceId: TARGET_ID, revision: 0n },
      ],
      deletedSpaceIds: [],
    });
    meta.submit({
      ...meta.getState().working,
      document: { ...meta.getState().working.document, title: 'Corrected Meta' },
    });
    await vi.waitFor(() => expect(meta.getState().persistence.kind).toBe('settled'));
    expect(target?.getState().persistence.kind).toBe('settled');
  });

  it('atomically creates the first Space Resource and its normal target Space', async () => {
    const backend = new MemorySpaceBackend(META_ID, [
      { snapshot: metaSnapshot, revision: 3n, exportedRevision: null },
    ]);
    const registry = createSpaceSessionRegistry(backend);
    registry.open({ snapshot: metaSnapshot, revision: 3n, exportedRevision: null });
    const lifecycle = registry.spaceResources(
      idSource([TARGET_ID, TARGET_RESOURCE_ID, TARGET_MAP_ID, TARGET_GRAPH_ID, SPACE_RESOURCE_ID]),
    );

    await expect(
      lifecycle.create({
        containingSpaceId: META_ID,
        mapId: META_MAP_ID,
        title: 'Architecture',
        position: { x: 240, y: 80 },
      }),
    ).resolves.toEqual({ kind: 'completed', resourceId: SPACE_RESOURCE_ID });

    const result = await backend.loadAggregate();
    if (result.kind === 'uninitialized') throw new Error('Test backend is uninitialized');
    const aggregate = result.aggregate;
    expect(aggregate.spaces).toHaveLength(2);
    const storedMeta = await backend.loadSpace(META_ID);
    expect(storedMeta?.revision).toBe(4n);
    expect(storedMeta?.snapshot.resources).toContainEqual({
      id: SPACE_RESOURCE_ID,
      document: {
        title: 'Architecture',
        kind: 'space',
        spaceId: TARGET_ID,
        // The Map and Graph initialization minted for the target it just
        // made, kept rather than discarded (ADR 0079). A created Space Resource
        // stores a selection from the moment it exists, and the only Map in
        // existence for a Space one Edit old is the one that Edit authored.
        map: TARGET_MAP_ID,
        graph: TARGET_GRAPH_ID,
      },
    });
    expect(storedMeta?.snapshot.document.maps?.[0]?.positions[SPACE_RESOURCE_ID]).toEqual({
      x: 240,
      y: 80,
      open: false,
    });
    expect(await backend.loadSpace(TARGET_ID)).toEqual({
      revision: 0n,
      exportedRevision: null,
      snapshot: {
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
              graphs: [
                { id: TARGET_GRAPH_ID, title: 'Graph 1', color: nextGraphColor([]), edges: [] },
              ],
              activeGraph: TARGET_GRAPH_ID,
            },
          ],
        },
        resources: [
          {
            // The typed title names the *Space*. Its first Resource takes the same
            // neutral `Resource 1` every new Space's first Resource takes, because the
            // two are independent from the moment they exist (ADR 0068).
            id: TARGET_RESOURCE_ID,
            document: { title: 'Resource 1', kind: 'markdown', body: '' },
          },
        ],
      },
    });
  });

  it('links an existing Space and deletes its target only after the last reference is removed', async () => {
    const linkedMeta: SpaceSnapshot = {
      ...metaSnapshot,
      resources: [
        ...metaSnapshot.resources,
        {
          id: SPACE_RESOURCE_ID,
          document: {
            title: 'First link',
            kind: 'space',
            spaceId: TARGET_ID,
            map: TARGET_MAP_ID,
            graph: TARGET_GRAPH_ID,
          },
        },
      ],
      document: {
        ...metaSnapshot.document,
        maps: metaSnapshot.document.maps?.map((map) => ({
          ...map,
          positions: {
            ...map.positions,
            [SPACE_RESOURCE_ID]: { x: 240, y: 80, open: false },
          },
        })),
      },
    };
    const targetWithChild: SpaceSnapshot = {
      ...targetSnapshot,
      resources: [
        ...targetSnapshot.resources,
        {
          id: CHILD_LINK_ID,
          document: {
            title: 'Child',
            kind: 'space',
            spaceId: CHILD_ID,
            map: CHILD_MAP_ID,
            graph: CHILD_GRAPH_ID,
          },
        },
      ],
    };
    const child: SpaceSnapshot = {
      id: CHILD_ID,
      document: {
        version: 1,
        title: 'Child',
        defaultMap: CHILD_MAP_ID,
        maps: [
          {
            id: CHILD_MAP_ID,
            title: 'Map 1',
            kind: 'positioned',
            positions: { [CHILD_RESOURCE_ID]: { x: 0, y: 0, open: false } },
            graphs: [{ id: CHILD_GRAPH_ID, title: 'Graph 1', edges: [] }],
            activeGraph: CHILD_GRAPH_ID,
          },
        ],
      },
      resources: [
        {
          id: CHILD_RESOURCE_ID,
          document: { title: 'Child', kind: 'markdown', body: '' },
        },
      ],
    };
    const backend = new MemorySpaceBackend(META_ID, [
      { snapshot: linkedMeta, revision: 3n, exportedRevision: null },
      { snapshot: targetWithChild, revision: 7n, exportedRevision: null },
      { snapshot: child, revision: 2n, exportedRevision: null },
    ]);
    const registry = createSpaceSessionRegistry(backend);
    registry.open({ snapshot: linkedMeta, revision: 3n, exportedRevision: null });
    const lifecycle = registry.spaceResources(idSource([SECOND_SPACE_RESOURCE_ID]));

    await expect(
      lifecycle.link({
        containingSpaceId: META_ID,
        mapId: META_MAP_ID,
        targetSpaceId: TARGET_ID,
        title: 'Second link',
        position: { x: 480, y: 80 },
      }),
    ).resolves.toEqual({ kind: 'completed', resourceId: SECOND_SPACE_RESOURCE_ID });

    await expect(
      lifecycle.delete({ containingSpaceId: META_ID, resourceId: SPACE_RESOURCE_ID }),
    ).resolves.toEqual({ kind: 'completed' });
    expect(await backend.loadSpace(TARGET_ID)).toMatchObject({ revision: 7n });

    await expect(
      lifecycle.delete({ containingSpaceId: META_ID, resourceId: SECOND_SPACE_RESOURCE_ID }),
    ).resolves.toEqual({ kind: 'completed' });
    expect(await backend.loadSpace(TARGET_ID)).toBeUndefined();
    expect(await backend.loadSpace(CHILD_ID)).toBeUndefined();
  });

  it('links an initialized Space by storing the selection that Space already opens on', async () => {
    const control = new MemorySpaceBackendTestControl();
    const backend = new MemorySpaceBackend(
      META_ID,
      [
        { snapshot: metaSnapshot, revision: 3n, exportedRevision: null },
        { snapshot: targetSnapshot, revision: 7n, exportedRevision: null },
      ],
      control,
    );
    const registry = createSpaceSessionRegistry(backend);
    registry.open({ snapshot: metaSnapshot, revision: 3n, exportedRevision: null });
    // One identity, and it is the Resource's. A target that already opens on a
    // Map has nothing left for this Edit to mint (ADR 0079), and an
    // exhausted source throws rather than quietly handing out a real id — so
    // the count is asserted by the source rather than by a spy.
    const lifecycle = registry.spaceResources(idSource([SPACE_RESOURCE_ID]));

    await expect(
      lifecycle.link({
        containingSpaceId: META_ID,
        mapId: META_MAP_ID,
        targetSpaceId: TARGET_ID,
        title: 'Architecture',
        position: { x: 240, y: 80 },
      }),
    ).resolves.toEqual({ kind: 'completed', resourceId: SPACE_RESOURCE_ID });

    const storedMeta = await backend.loadSpace(META_ID);
    expect(storedMeta?.snapshot.resources).toContainEqual({
      id: SPACE_RESOURCE_ID,
      document: {
        title: 'Architecture',
        kind: 'space',
        spaceId: TARGET_ID,
        map: TARGET_MAP_ID,
        graph: TARGET_GRAPH_ID,
      },
    });
    // Read, never written. Linking is an Edit on the Space doing the pointing,
    // and the one commit this made is that Space's.
    expect(await backend.loadSpace(TARGET_ID)).toEqual({
      snapshot: targetSnapshot,
      revision: 7n,
      exportedRevision: null,
    });
    expect(control.requests).toHaveLength(1);
  });

  it('durably initializes a stored mapless target before the Resource that selects it exists', async () => {
    const maplessTarget: SpaceSnapshot = {
      id: TARGET_ID,
      document: { version: 1, title: 'Architecture' },
      resources: [
        {
          id: TARGET_RESOURCE_ID,
          document: { title: 'Architecture', kind: 'markdown', body: '' },
        },
      ],
    };
    const control = new MemorySpaceBackendTestControl();
    const backend = new MemorySpaceBackend(
      META_ID,
      [
        { snapshot: metaSnapshot, revision: 3n, exportedRevision: null },
        { snapshot: maplessTarget, revision: 7n, exportedRevision: null },
      ],
      control,
    );
    const registry = createSpaceSessionRegistry(backend);
    registry.open({ snapshot: metaSnapshot, revision: 3n, exportedRevision: null });
    // The Map and the Graph initialization mints, in that order, and only
    // then the Resource's own id. Initialization runs before the Edit rather than
    // inside it, so an id source written in any other order is exhausted at the
    // draw that proves it (ADR 0016, ADR 0079).
    const lifecycle = registry.spaceResources(
      idSource([TARGET_MAP_ID, TARGET_GRAPH_ID, SPACE_RESOURCE_ID]),
    );

    await expect(
      lifecycle.link({
        containingSpaceId: META_ID,
        mapId: META_MAP_ID,
        targetSpaceId: TARGET_ID,
        title: 'Architecture',
        position: { x: 240, y: 80 },
      }),
    ).resolves.toEqual({ kind: 'completed', resourceId: SPACE_RESOURCE_ID });

    // Durable by the time the lifecycle answers, in its own commit: the target
    // carries the complete Map rather than a selection only the Resource
    // remembers.
    expect(await backend.loadSpace(TARGET_ID)).toEqual({
      revision: 8n,
      exportedRevision: null,
      snapshot: {
        ...maplessTarget,
        document: {
          version: 1,
          title: 'Architecture',
          defaultMap: TARGET_MAP_ID,
          maps: [
            {
              id: TARGET_MAP_ID,
              title: 'Map 1',
              kind: 'positioned',
              positions: {},
              graphs: [
                { id: TARGET_GRAPH_ID, title: 'Graph 1', color: nextGraphColor([]), edges: [] },
              ],
              activeGraph: TARGET_GRAPH_ID,
            },
          ],
        },
      },
    });
    const storedMeta = await backend.loadSpace(META_ID);
    expect(storedMeta?.snapshot.resources).toContainEqual({
      id: SPACE_RESOURCE_ID,
      document: {
        title: 'Architecture',
        kind: 'space',
        spaceId: TARGET_ID,
        map: TARGET_MAP_ID,
        graph: TARGET_GRAPH_ID,
      },
    });
  });

  it("selects the Map's authored Active Graph rather than the head of its list", async () => {
    const targetWithLaterActiveGraph: SpaceSnapshot = {
      ...targetSnapshot,
      document: {
        ...targetSnapshot.document,
        maps: [
          {
            id: TARGET_MAP_ID,
            title: 'Map 1',
            kind: 'positioned',
            positions: { [TARGET_RESOURCE_ID]: { x: 0, y: 0, open: false } },
            graphs: [
              { id: TARGET_GRAPH_ID, title: 'Graph 1', edges: [] },
              { id: SECOND_TARGET_GRAPH_ID, title: 'Graph 2', edges: [] },
            ],
            activeGraph: SECOND_TARGET_GRAPH_ID,
          },
        ],
      },
    };
    const backend = new MemorySpaceBackend(META_ID, [
      { snapshot: metaSnapshot, revision: 3n, exportedRevision: null },
      { snapshot: targetWithLaterActiveGraph, revision: 7n, exportedRevision: null },
    ]);
    const registry = createSpaceSessionRegistry(backend);
    registry.open({ snapshot: metaSnapshot, revision: 3n, exportedRevision: null });
    const lifecycle = registry.spaceResources(idSource([SPACE_RESOURCE_ID]));

    await expect(
      lifecycle.link({
        containingSpaceId: META_ID,
        mapId: META_MAP_ID,
        targetSpaceId: TARGET_ID,
        title: 'Architecture',
        position: { x: 240, y: 80 },
      }),
    ).resolves.toEqual({ kind: 'completed', resourceId: SPACE_RESOURCE_ID });

    // The head of `graphs` is what an *unauthored* `activeGraph` falls back to,
    // so a target that has authored one is the case that tells the rule from
    // the fallback (ADR 0026).
    const storedMeta = await backend.loadSpace(META_ID);
    expect(storedMeta?.snapshot.resources).toContainEqual({
      id: SPACE_RESOURCE_ID,
      document: {
        title: 'Architecture',
        kind: 'space',
        spaceId: TARGET_ID,
        map: TARGET_MAP_ID,
        graph: SECOND_TARGET_GRAPH_ID,
      },
    });
  });

  it('refuses a link whose target could not be initialized and authors nothing', async () => {
    const maplessTarget: SpaceSnapshot = {
      id: TARGET_ID,
      document: { version: 1, title: 'Architecture' },
      resources: [
        {
          id: TARGET_RESOURCE_ID,
          document: { title: 'Architecture', kind: 'markdown', body: '' },
        },
      ],
    };
    const control = new MemorySpaceBackendTestControl();
    control.queueResult({ kind: 'permanent-failure', code: 'forbidden' });
    const backend = new MemorySpaceBackend(
      META_ID,
      [
        { snapshot: metaSnapshot, revision: 3n, exportedRevision: null },
        { snapshot: maplessTarget, revision: 7n, exportedRevision: null },
      ],
      control,
    );
    const registry = createSpaceSessionRegistry(backend);
    const meta = registry.open({ snapshot: metaSnapshot, revision: 3n, exportedRevision: null });
    const before = structuredClone(meta.getState());
    const lifecycle = registry.spaceResources(idSource([TARGET_MAP_ID, TARGET_GRAPH_ID]));

    await expect(
      lifecycle.link({
        containingSpaceId: META_ID,
        mapId: META_MAP_ID,
        targetSpaceId: TARGET_ID,
        title: 'Architecture',
        position: { x: 240, y: 80 },
      }),
    ).resolves.toEqual({
      kind: 'refused',
      refusal: {
        code: 'space-resource-target-unavailable',
        spaceId: TARGET_ID,
        reason: 'not-initialized',
      },
    });

    // The two identities the attempt drew are spent and the target is untouched,
    // but no Resource names either: initialization running before the Edit is what
    // makes a failure here produce nothing rather than half of something.
    expect(meta.getState()).toEqual(before);
    expect(await backend.loadSpace(META_ID)).toEqual({
      snapshot: metaSnapshot,
      revision: 3n,
      exportedRevision: null,
    });
    expect(await backend.loadSpace(TARGET_ID)).toEqual({
      snapshot: maplessTarget,
      revision: 7n,
      exportedRevision: null,
    });
    expect(control.requests).toHaveLength(1);
  });

  /**
   * The residue an aggregate refusal leaves behind, stated rather than repaired
   * (ADR 0079).
   *
   * Initialization commits on its own, before `derive` returns, so a refusal
   * that lands after it keeps the Map and Graph it minted while making no
   * Resource. That is accepted: ADR 0079 already has a Space gain its Map the
   * first time anything works with it, so what survives is the state merely
   * opening the target would have reached — and the second attempt proves it
   * costs nothing, minting no identity and issuing no commit of its own before
   * being refused again for the same reason.
   *
   * The refusal itself is a cycle, which is a refusal only the whole aggregate
   * can see: the target already names Meta, so linking Meta to the target
   * closes the loop, and nothing before the coordinated intake could have known
   * that.
   */
  it('keeps a target it initialized when the Edit that asked for it is refused', async () => {
    const maplessTargetNamingMeta: SpaceSnapshot = {
      id: TARGET_ID,
      document: { version: 1, title: 'Architecture' },
      resources: [
        {
          id: TARGET_RESOURCE_ID,
          document: {
            title: 'Back to Meta',
            kind: 'space',
            spaceId: META_ID,
            map: META_MAP_ID,
            graph: META_GRAPH_ID,
          },
        },
      ],
    };
    const control = new MemorySpaceBackendTestControl();
    const backend = new MemorySpaceBackend(
      META_ID,
      [
        { snapshot: metaSnapshot, revision: 3n, exportedRevision: null },
        { snapshot: maplessTargetNamingMeta, revision: 7n, exportedRevision: null },
      ],
      control,
    );
    const registry = createSpaceSessionRegistry(backend);
    const meta = registry.open({ snapshot: metaSnapshot, revision: 3n, exportedRevision: null });
    const before = structuredClone(meta.getState());
    // Three for the first attempt — the Map, its Graph, then the Resource the
    // refusal discards — and one for the second, which draws a Resource id the way
    // every attempt does and draws no Map or Graph, which is the claim. A
    // fifth would mean the retry re-initialized.
    const lifecycle = registry.spaceResources(
      idSource([TARGET_MAP_ID, TARGET_GRAPH_ID, SPACE_RESOURCE_ID, SECOND_SPACE_RESOURCE_ID]),
    );
    const link = () =>
      lifecycle.link({
        containingSpaceId: META_ID,
        mapId: META_MAP_ID,
        targetSpaceId: TARGET_ID,
        title: 'Architecture',
        position: { x: 240, y: 80 },
      });

    const first = await link();
    expect(first).toEqual({
      kind: 'refused',
      refusal: {
        code: 'aggregate-refused',
        errors: [
          {
            kind: 'space-resource-reference-cycle',
            spaceId: TARGET_ID,
            resourceId: TARGET_RESOURCE_ID,
            targetSpaceId: META_ID,
          },
        ],
      },
    });

    // No Resource anywhere, and Meta is exactly as it was.
    expect(meta.getState()).toEqual(before);
    expect(await backend.loadSpace(META_ID)).toEqual({
      snapshot: metaSnapshot,
      revision: 3n,
      exportedRevision: null,
    });
    // The target, however, keeps what initialization gave it.
    const initialized = await backend.loadSpace(TARGET_ID);
    expect(initialized?.revision).toBe(8n);
    expect(initialized?.snapshot.document.defaultMap).toBe(TARGET_MAP_ID);
    expect(control.requests).toHaveLength(1);

    // Idempotent: the retry reads a target that is already initialized, so it
    // mints no second Map or Graph and issues no second commit, and is
    // refused for the one reason that was ever true. Exhausting the id source
    // is what would report a re-initialization.
    expect(await link()).toEqual(first);
    expect(await backend.loadSpace(TARGET_ID)).toEqual(initialized);
    expect(control.requests).toHaveLength(1);
  });

  it('refuses a link to a target that has gone since it was listed', async () => {
    const control = new MemorySpaceBackendTestControl();
    const backend = new MemorySpaceBackend(
      META_ID,
      [{ snapshot: metaSnapshot, revision: 3n, exportedRevision: null }],
      control,
    );
    const registry = createSpaceSessionRegistry(backend);
    const meta = registry.open({ snapshot: metaSnapshot, revision: 3n, exportedRevision: null });
    const lifecycle = registry.spaceResources(idSource([]));

    // The same refusal a failed initialization answers, and for the same reason:
    // the author's move is to choose another Space, and this Edit did not begin.
    // A target that has gone is an ordinary answer rather than a throw, because
    // nothing holds the listing and the Edit together.
    await expect(
      lifecycle.link({
        containingSpaceId: META_ID,
        mapId: META_MAP_ID,
        targetSpaceId: TARGET_ID,
        title: 'Architecture',
        position: { x: 240, y: 80 },
      }),
    ).resolves.toEqual({
      kind: 'refused',
      refusal: { code: 'space-resource-target-unavailable', spaceId: TARGET_ID, reason: 'missing' },
    });
    expect(meta.getState().working).toEqual(metaSnapshot);
    expect(control.requests).toHaveLength(0);
  });

  /**
   * A target whose stored state is not a valid Space is refused as unreadable,
   * and nothing tries to repair it.
   *
   * The working load deliberately leaves an invalid snapshot alone — repairing
   * one would replace the opening path's complete diagnostics with a commit
   * refusal — so it comes back exactly as stored and has no selection to give.
   * That is a different answer from a failed commit: the Space is there and
   * retrying will read the same broken state, which is why this arm's sentence
   * does not invite one.
   */
  it('refuses a link to a target whose stored state is not a valid Space', async () => {
    const unreadableTarget: SpaceSnapshot = {
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
            // Names a Resource this Space does not hold, which is what single-Space
            // intake refuses and what no repair here would mend.
            graphs: [
              {
                id: TARGET_GRAPH_ID,
                title: 'Graph 1',
                edges: [{ from: TARGET_RESOURCE_ID, to: SECOND_SPACE_RESOURCE_ID }],
              },
            ],
            activeGraph: TARGET_GRAPH_ID,
          },
        ],
      },
      resources: [
        { id: TARGET_RESOURCE_ID, document: { title: 'Architecture', kind: 'markdown', body: '' } },
      ],
    };
    const control = new MemorySpaceBackendTestControl();
    const backend = new MemorySpaceBackend(
      META_ID,
      [
        { snapshot: metaSnapshot, revision: 3n, exportedRevision: null },
        { snapshot: unreadableTarget, revision: 7n, exportedRevision: null },
      ],
      control,
    );
    const registry = createSpaceSessionRegistry(backend);
    const meta = registry.open({ snapshot: metaSnapshot, revision: 3n, exportedRevision: null });
    const lifecycle = registry.spaceResources(idSource([]));

    await expect(
      lifecycle.link({
        containingSpaceId: META_ID,
        mapId: META_MAP_ID,
        targetSpaceId: TARGET_ID,
        title: 'Architecture',
        position: { x: 240, y: 80 },
      }),
    ).resolves.toEqual({
      kind: 'refused',
      refusal: {
        code: 'space-resource-target-unavailable',
        spaceId: TARGET_ID,
        reason: 'unreadable',
      },
    });

    // The empty id source is the second claim: an unreadable target is refused
    // without minting the Map and Graph an initializable one would have.
    expect(meta.getState().working).toEqual(metaSnapshot);
    expect(control.requests).toHaveLength(0);
  });

  // Renamed twice, from "keeps a target referenced by an uncommitted
  // sibling session" then "does not let an uncommitted sibling reference
  // save a target from a cascading deletion": neither survives ADR 0099's
  // one recovery rule. Target's stored inbound count is genuinely zero —
  // Sibling's reference lives only in its own uncommitted, `failed`
  // working Space, so it must not be read as a *stored* reference that
  // would save Target from the cascade (that mismatch between what the
  // browser decides and what the repository would accept is exactly what
  // `decideCommit`'s `ordinary-space-unreferenced` check would catch) —
  // but Sibling needing recovery, with that same working Space pointing at
  // Target (the "add" direction: the reference exists only in working, not
  // storage), is reason enough to refuse the whole deletion until Sibling
  // is recovered, rather than strand its own retry with a dangling
  // reference by deleting the Space out from under it.
  it('refuses a cascading deletion that would delete a target a failed sibling still references in its working Space', async () => {
    const linkedMeta: SpaceSnapshot = {
      ...metaSnapshot,
      resources: [
        ...metaSnapshot.resources,
        {
          id: SPACE_RESOURCE_ID,
          document: {
            title: 'Target',
            kind: 'space',
            spaceId: TARGET_ID,
            map: TARGET_MAP_ID,
            graph: TARGET_GRAPH_ID,
          },
        },
        {
          id: SECOND_SPACE_RESOURCE_ID,
          document: {
            title: 'Sibling',
            kind: 'space',
            spaceId: CHILD_ID,
            map: CHILD_MAP_ID,
            graph: CHILD_GRAPH_ID,
          },
        },
      ],
    };
    const sibling: SpaceSnapshot = {
      id: CHILD_ID,
      document: {
        version: 1,
        title: 'Sibling',
        defaultMap: CHILD_MAP_ID,
        maps: [
          {
            id: CHILD_MAP_ID,
            title: 'Map 1',
            kind: 'positioned',
            positions: { [CHILD_RESOURCE_ID]: { x: 0, y: 0, open: false } },
            graphs: [{ id: CHILD_GRAPH_ID, title: 'Graph 1', edges: [] }],
            activeGraph: CHILD_GRAPH_ID,
          },
        ],
      },
      resources: [
        {
          id: CHILD_RESOURCE_ID,
          document: { title: 'Sibling', kind: 'markdown', body: '' },
        },
      ],
    };
    const control = new MemorySpaceBackendTestControl();
    const backend = new MemorySpaceBackend(
      META_ID,
      [
        { snapshot: linkedMeta, revision: 3n, exportedRevision: null },
        { snapshot: targetSnapshot, revision: 7n, exportedRevision: null },
        { snapshot: sibling, revision: 2n, exportedRevision: null },
      ],
      control,
    );
    const registry = createSpaceSessionRegistry(backend);
    const metaSession = registry.open({
      snapshot: linkedMeta,
      revision: 3n,
      exportedRevision: null,
    });
    const siblingSession = registry.open({
      snapshot: sibling,
      revision: 2n,
      exportedRevision: null,
    });
    control.queueResult({ kind: 'retryable-failure', code: 'network' });
    siblingSession.submit({
      ...sibling,
      resources: [
        ...sibling.resources,
        {
          id: CHILD_LINK_ID,
          document: {
            title: 'Target',
            kind: 'space',
            spaceId: TARGET_ID,
            map: TARGET_MAP_ID,
            graph: TARGET_GRAPH_ID,
          },
        },
      ],
    });
    await vi.waitFor(() => expect(siblingSession.getState().persistence.kind).toBe('failed'));
    const lifecycle = registry.spaceResources(idSource([]));
    const requestsBefore = control.requests.length;
    const metaBefore = structuredClone(metaSession.getState());

    await expect(
      lifecycle.delete({ containingSpaceId: META_ID, resourceId: SPACE_RESOURCE_ID }),
    ).resolves.toEqual({
      kind: 'refused',
      refusal: { code: 'persistence-recovery-required', spaceId: CHILD_ID, recovery: 'retry' },
    });

    // Refused, not cascaded: Sibling's own retry still needs Target, and
    // deleting it here would strand that retry with a dangling reference
    // forever. Nothing installed, nothing committed.
    expect(await backend.loadSpace(TARGET_ID)).toEqual({
      snapshot: targetSnapshot,
      revision: 7n,
      exportedRevision: null,
    });
    expect(registry.session(TARGET_ID)).toBeUndefined();
    expect(metaSession.getState()).toEqual(metaBefore);
    expect(siblingSession.getState().persistence.kind).toBe('failed');
    expect(control.requests).toHaveLength(requestsBefore);
  });

  it.each(['link', 'create'] as const)(
    'refuses %s when its containing Map is absent',
    async (operation) => {
      const backend = new MemorySpaceBackend(META_ID, [
        { snapshot: metaSnapshot, revision: 3n, exportedRevision: null },
        { snapshot: targetSnapshot, revision: 7n, exportedRevision: null },
      ]);
      const registry = createSpaceSessionRegistry(backend);
      registry.open({ snapshot: metaSnapshot, revision: 3n, exportedRevision: null });
      const lifecycle = registry.spaceResources(idSource([]));

      const result =
        operation === 'link'
          ? await lifecycle.link({
              containingSpaceId: META_ID,
              mapId: TARGET_MAP_ID,
              targetSpaceId: TARGET_ID,
              title: 'Missing map',
              position: { x: 240, y: 80 },
            })
          : await lifecycle.create({
              containingSpaceId: META_ID,
              mapId: TARGET_MAP_ID,
              title: 'Missing map',
              position: { x: 240, y: 80 },
            });

      expect(result).toEqual({
        kind: 'refused',
        refusal: { code: 'map-not-found', mapId: TARGET_MAP_ID },
      });
    },
  );

  it('refuses deletion when the selected Resource is not a Space Resource', async () => {
    const backend = new MemorySpaceBackend(META_ID, [
      { snapshot: metaSnapshot, revision: 3n, exportedRevision: null },
    ]);
    const registry = createSpaceSessionRegistry(backend);
    registry.open({ snapshot: metaSnapshot, revision: 3n, exportedRevision: null });
    const lifecycle = registry.spaceResources(idSource([]));

    await expect(
      lifecycle.delete({ containingSpaceId: META_ID, resourceId: META_RESOURCE_ID }),
    ).resolves.toEqual({
      kind: 'refused',
      refusal: { code: 'space-resource-not-found', resourceId: META_RESOURCE_ID },
    });
  });

  // The barrier waits only for a target's in-flight commit, not for local
  // work still queued behind it (ADR 0076/0095: queued work commits after
  // this turn, not during it) — so a link reads whatever is currently
  // stored, never a session's own queued-but-uncommitted Graph.
  it("links against a target Space's stored selection, not a Graph still queued behind an in-flight commit", async () => {
    const control = new MemorySpaceBackendTestControl();
    const backend = new MemorySpaceBackend(
      META_ID,
      [
        { snapshot: metaSnapshot, revision: 3n, exportedRevision: null },
        { snapshot: targetSnapshot, revision: 7n, exportedRevision: null },
      ],
      control,
    );
    const registry = createSpaceSessionRegistry(backend);
    registry.open({ snapshot: metaSnapshot, revision: 3n, exportedRevision: null });
    const target = registry.open({
      snapshot: targetSnapshot,
      revision: 7n,
      exportedRevision: null,
    });
    const release = control.deferNextCommit();
    // In flight, deferred by the control.
    target.submit(target.getState().working);
    // Queued behind it: local work the barrier does not wait for. A second
    // Graph, made Active, so reading it (which would be a defect) is
    // observable.
    const withNewGraph: SpaceSnapshot = {
      ...targetSnapshot,
      document: {
        ...targetSnapshot.document,
        maps: targetSnapshot.document.maps?.map((map) => ({
          ...map,
          graphs: [...map.graphs, { id: SECOND_TARGET_GRAPH_ID, title: 'Graph 2', edges: [] }],
          activeGraph: SECOND_TARGET_GRAPH_ID,
        })),
      },
    };
    target.submit(withNewGraph);
    const lifecycle = registry.spaceResources(idSource([SPACE_RESOURCE_ID]));

    // The barrier's one wait is for this in-flight commit, and only it —
    // releasing it is what lets the turn proceed.
    const link = lifecycle.link({
      containingSpaceId: META_ID,
      mapId: META_MAP_ID,
      targetSpaceId: TARGET_ID,
      title: 'Link',
      position: { x: 240, y: 80 },
    });
    release();

    await expect(link).resolves.toEqual({ kind: 'completed', resourceId: SPACE_RESOURCE_ID });
    const storedMeta = await backend.loadSpace(META_ID);
    expect(storedMeta?.snapshot.resources).toContainEqual({
      id: SPACE_RESOURCE_ID,
      document: {
        title: 'Link',
        kind: 'space',
        spaceId: TARGET_ID,
        map: TARGET_MAP_ID,
        graph: TARGET_GRAPH_ID,
      },
    });
    // The queued Graph never got a chance to commit during this turn — it
    // starts only once the barrier drops, in `resumePersistence`.
    await vi.waitFor(() => expect(target.getState().persistence.kind).toBe('settled'));
    expect(target.getState().working.document.maps?.[0]?.activeGraph).toBe(SECOND_TARGET_GRAPH_ID);
  });

  it.each([
    {
      result: { kind: 'retryable-failure', code: 'network' } as const,
      persistence: 'failed',
      recovery: 'retry',
    },
    {
      result: {
        kind: 'conflict',
        conflicts: [
          {
            spaceId: TARGET_ID,
            current: { snapshot: targetSnapshot, revision: 9n, exportedRevision: null },
          },
        ],
      } as const,
      persistence: 'conflicted',
      recovery: 'resolve-conflict',
    },
  ])(
    'refuses a link whose target is $persistence, naming the target, and installs nothing',
    async ({ result, persistence, recovery }) => {
      const control = new MemorySpaceBackendTestControl();
      control.queueResult(result);
      const backend = new MemorySpaceBackend(
        META_ID,
        [
          { snapshot: metaSnapshot, revision: 3n, exportedRevision: null },
          { snapshot: targetSnapshot, revision: 7n, exportedRevision: null },
        ],
        control,
      );
      const registry = createSpaceSessionRegistry(backend);
      const meta = registry.open({ snapshot: metaSnapshot, revision: 3n, exportedRevision: null });
      const target = registry.open({
        snapshot: targetSnapshot,
        revision: 7n,
        exportedRevision: null,
      });
      target.submit(target.getState().working);
      await vi.waitFor(() => expect(target.getState().persistence.kind).toBe(persistence));
      const before = structuredClone(meta.getState());
      const lifecycle = registry.spaceResources(idSource([]));

      await expect(
        lifecycle.link({
          containingSpaceId: META_ID,
          mapId: META_MAP_ID,
          targetSpaceId: TARGET_ID,
          title: 'Blocked link',
          position: { x: 240, y: 80 },
        }),
      ).resolves.toEqual({
        kind: 'refused',
        refusal: { code: 'persistence-recovery-required', spaceId: TARGET_ID, recovery },
      });
      expect(meta.getState()).toEqual(before);
      expect(control.requests).toHaveLength(1);
    },
  );

  it('does not cascade a deletion through a target another Space still references in storage after a transient failure elsewhere', async () => {
    const linkedMeta: SpaceSnapshot = {
      ...metaSnapshot,
      resources: [
        ...metaSnapshot.resources,
        {
          id: SPACE_RESOURCE_ID,
          document: {
            title: 'Target',
            kind: 'space',
            spaceId: TARGET_ID,
            map: TARGET_MAP_ID,
            graph: TARGET_GRAPH_ID,
          },
        },
      ],
      document: {
        ...metaSnapshot.document,
        maps: metaSnapshot.document.maps?.map((map) => ({
          ...map,
          positions: {
            ...map.positions,
            [SPACE_RESOURCE_ID]: { x: 240, y: 80, open: false },
          },
        })),
      },
    };
    const siblingWithReference: SpaceSnapshot = {
      id: CHILD_ID,
      document: {
        version: 1,
        title: 'Sibling',
        defaultMap: CHILD_MAP_ID,
        maps: [
          {
            id: CHILD_MAP_ID,
            title: 'Map 1',
            kind: 'positioned',
            positions: {
              [CHILD_RESOURCE_ID]: { x: 0, y: 0, open: false },
              [CHILD_LINK_ID]: { x: 240, y: 80, open: false },
            },
            graphs: [{ id: CHILD_GRAPH_ID, title: 'Graph 1', edges: [] }],
            activeGraph: CHILD_GRAPH_ID,
          },
        ],
      },
      resources: [
        { id: CHILD_RESOURCE_ID, document: { title: 'Sibling', kind: 'markdown', body: '' } },
        {
          id: CHILD_LINK_ID,
          document: {
            title: 'Target',
            kind: 'space',
            spaceId: TARGET_ID,
            map: TARGET_MAP_ID,
            graph: TARGET_GRAPH_ID,
          },
        },
      ],
    };
    const control = new MemorySpaceBackendTestControl();
    const backend = new MemorySpaceBackend(
      META_ID,
      [
        { snapshot: linkedMeta, revision: 3n, exportedRevision: null },
        { snapshot: targetSnapshot, revision: 7n, exportedRevision: null },
        { snapshot: siblingWithReference, revision: 2n, exportedRevision: null },
      ],
      control,
    );
    const registry = createSpaceSessionRegistry(backend);
    registry.open({ snapshot: linkedMeta, revision: 3n, exportedRevision: null });
    const sibling = registry.open({
      snapshot: siblingWithReference,
      revision: 2n,
      exportedRevision: null,
    });
    const siblingLifecycle = registry.spaceResources(idSource([]));
    control.queueResult({ kind: 'retryable-failure', code: 'network' });

    // Sibling's own attempt to remove its reference to Target is installed
    // locally (ADR 0076: the operation answers `completed` once installed)
    // and then fails to commit, transiently — its working state no longer
    // names Target, but storage still does.
    await expect(
      siblingLifecycle.delete({ containingSpaceId: CHILD_ID, resourceId: CHILD_LINK_ID }),
    ).resolves.toEqual({ kind: 'completed' });
    await vi.waitFor(() => expect(sibling.getState().persistence.kind).toBe('failed'));
    expect(sibling.getState().working.resources).not.toContainEqual(
      expect.objectContaining({ id: CHILD_LINK_ID }),
    );
    const storedSibling = await backend.loadSpace(CHILD_ID);
    expect(storedSibling?.snapshot.resources.some(({ id }) => id === CHILD_LINK_ID)).toBe(true);

    const metaLifecycle = registry.spaceResources(idSource([]));
    await expect(
      metaLifecycle.delete({ containingSpaceId: META_ID, resourceId: SPACE_RESOURCE_ID }),
    ).resolves.toEqual({ kind: 'completed' });

    // Target survives: storage still names Sibling as a reference, even
    // though Sibling's own uncommitted working state no longer does.
    expect(await backend.loadSpace(TARGET_ID)).toMatchObject({ revision: 7n });
    expect(registry.session(TARGET_ID)).toBeUndefined();
  });

  // The one recovery rule names a session only when it references a Space
  // this deletion would remove, or selects the Map or Graph it deletes
  // — a `failed` Space with neither is not a reason to refuse.
  it('does not refuse an ordinary deletion because an unrelated Space needs recovery', async () => {
    const linkedMeta: SpaceSnapshot = {
      ...metaSnapshot,
      resources: [
        ...metaSnapshot.resources,
        {
          id: SPACE_RESOURCE_ID,
          document: {
            title: 'Target',
            kind: 'space',
            spaceId: TARGET_ID,
            map: TARGET_MAP_ID,
            graph: TARGET_GRAPH_ID,
          },
        },
      ],
      document: {
        ...metaSnapshot.document,
        maps: metaSnapshot.document.maps?.map((map) => ({
          ...map,
          positions: {
            ...map.positions,
            [SPACE_RESOURCE_ID]: { x: 240, y: 80, open: false },
          },
        })),
      },
    };
    const unrelated: SpaceSnapshot = {
      id: CHILD_ID,
      document: { version: 1, title: 'Unrelated' },
      resources: [
        { id: CHILD_RESOURCE_ID, document: { title: 'Unrelated', kind: 'markdown', body: '' } },
      ],
    };
    const control = new MemorySpaceBackendTestControl();
    const backend = new MemorySpaceBackend(
      META_ID,
      [
        { snapshot: linkedMeta, revision: 3n, exportedRevision: null },
        { snapshot: targetSnapshot, revision: 7n, exportedRevision: null },
        { snapshot: unrelated, revision: 1n, exportedRevision: null },
      ],
      control,
    );
    const registry = createSpaceSessionRegistry(backend);
    registry.open({ snapshot: linkedMeta, revision: 3n, exportedRevision: null });
    const unrelatedSession = registry.open({
      snapshot: unrelated,
      revision: 1n,
      exportedRevision: null,
    });
    control.queueResult({ kind: 'retryable-failure', code: 'network' });
    unrelatedSession.submit({ ...unrelated, document: { version: 1, title: 'Unrelated 2' } });
    await vi.waitFor(() => expect(unrelatedSession.getState().persistence.kind).toBe('failed'));
    const lifecycle = registry.spaceResources(idSource([]));

    await expect(
      lifecycle.delete({ containingSpaceId: META_ID, resourceId: SPACE_RESOURCE_ID }),
    ).resolves.toEqual({ kind: 'completed' });

    // Target is genuinely cascaded away, and Unrelated's own failure is
    // left exactly as it was — neither consulted nor disturbed.
    expect(registry.session(TARGET_ID)).toBeUndefined();
    expect(unrelatedSession.getState().persistence.kind).toBe('failed');
  });

  it('forgives a Space already unreferenced in storage when the pre-check judges an unrelated Edit', async () => {
    const orphan: SpaceSnapshot = {
      id: CHILD_ID,
      document: {
        version: 1,
        title: 'Orphan',
        defaultMap: CHILD_MAP_ID,
        maps: [
          {
            id: CHILD_MAP_ID,
            title: 'Map 1',
            kind: 'positioned',
            positions: { [CHILD_RESOURCE_ID]: { x: 0, y: 0, open: false } },
            graphs: [{ id: CHILD_GRAPH_ID, title: 'Graph 1', edges: [] }],
            activeGraph: CHILD_GRAPH_ID,
          },
        ],
      },
      resources: [
        { id: CHILD_RESOURCE_ID, document: { title: 'Orphan', kind: 'markdown', body: '' } },
      ],
    };
    const backend = new MemorySpaceBackend(META_ID, [
      { snapshot: metaSnapshot, revision: 3n, exportedRevision: null },
      { snapshot: targetSnapshot, revision: 7n, exportedRevision: null },
      { snapshot: orphan, revision: 1n, exportedRevision: null },
    ]);
    const registry = createSpaceSessionRegistry(backend);
    registry.open({ snapshot: metaSnapshot, revision: 3n, exportedRevision: null });
    const lifecycle = registry.spaceResources(idSource([SPACE_RESOURCE_ID]));

    // Storage already holds an ordinary Space nothing references — a baseline
    // `decideCommit` forgives (ADR 0095) — and this link never touches it.
    // The old manual intake check had no such forgiveness and refused every
    // Edit while that baseline stood.
    await expect(
      lifecycle.link({
        containingSpaceId: META_ID,
        mapId: META_MAP_ID,
        targetSpaceId: TARGET_ID,
        title: 'Architecture',
        position: { x: 240, y: 80 },
      }),
    ).resolves.toEqual({ kind: 'completed', resourceId: SPACE_RESOURCE_ID });
  });

  it('reads the aggregate once per coordination turn for a cascading delete', async () => {
    class CountingAggregateBackend extends MemorySpaceBackend {
      loadAggregateCalls = 0;
      override loadAggregate(): ReturnType<MemorySpaceBackend['loadAggregate']> {
        this.loadAggregateCalls += 1;
        return super.loadAggregate();
      }
    }
    const linkedMeta: SpaceSnapshot = {
      ...metaSnapshot,
      resources: [
        ...metaSnapshot.resources,
        {
          id: SPACE_RESOURCE_ID,
          document: {
            title: 'Target',
            kind: 'space',
            spaceId: TARGET_ID,
            map: TARGET_MAP_ID,
            graph: TARGET_GRAPH_ID,
          },
        },
      ],
      document: {
        ...metaSnapshot.document,
        maps: metaSnapshot.document.maps?.map((map) => ({
          ...map,
          positions: {
            ...map.positions,
            [SPACE_RESOURCE_ID]: { x: 240, y: 80, open: false },
          },
        })),
      },
    };
    const backend = new CountingAggregateBackend(META_ID, [
      { snapshot: linkedMeta, revision: 3n, exportedRevision: null },
      { snapshot: targetSnapshot, revision: 7n, exportedRevision: null },
    ]);
    const registry = createSpaceSessionRegistry(backend);
    registry.open({ snapshot: linkedMeta, revision: 3n, exportedRevision: null });
    const lifecycle = registry.spaceResources(idSource([]));

    await expect(
      lifecycle.delete({ containingSpaceId: META_ID, resourceId: SPACE_RESOURCE_ID }),
    ).resolves.toEqual({ kind: 'completed' });

    expect(backend.loadAggregateCalls).toBe(1);
  });
});

/*
 * Characterisation of the coordinated commit, one test per path the existing
 * cases above leave open. Each name leads with the path it pins.
 */
describe('Space Resource coordination paths', () => {
  const linkedMeta: SpaceSnapshot = {
    ...metaSnapshot,
    resources: [
      ...metaSnapshot.resources,
      {
        id: SPACE_RESOURCE_ID,
        document: {
          title: 'Target',
          kind: 'space',
          spaceId: TARGET_ID,
          map: TARGET_MAP_ID,
          graph: TARGET_GRAPH_ID,
        },
      },
    ],
    document: {
      ...metaSnapshot.document,
      maps: metaSnapshot.document.maps?.map((map) => ({
        ...map,
        positions: { ...map.positions, [SPACE_RESOURCE_ID]: { x: 240, y: 80, open: false } },
      })),
    },
  };
  const createIds = () =>
    idSource([TARGET_ID, TARGET_RESOURCE_ID, TARGET_MAP_ID, TARGET_GRAPH_ID, SPACE_RESOURCE_ID]);
  const createInput = {
    containingSpaceId: META_ID,
    mapId: META_MAP_ID,
    title: 'Architecture',
    position: { x: 240, y: 80 },
  };

  it('barrier: holds retirement until the coordination turn and its queued work are done', async () => {
    const control = new MemorySpaceBackendTestControl();
    const releaseCommit = control.deferNextCommit();
    const backend = new MemorySpaceBackend(
      META_ID,
      [
        { snapshot: metaSnapshot, revision: 3n, exportedRevision: null },
        { snapshot: targetSnapshot, revision: 7n, exportedRevision: null },
      ],
      control,
    );
    const registry = createSpaceSessionRegistry(backend);
    const meta = registry.open({ snapshot: metaSnapshot, revision: 3n, exportedRevision: null });
    const lifecycle = registry.spaceResources(idSource([SPACE_RESOURCE_ID]));

    await lifecycle.link({
      containingSpaceId: META_ID,
      mapId: META_MAP_ID,
      targetSpaceId: TARGET_ID,
      title: 'Link',
      position: { x: 240, y: 80 },
    });
    meta.submit({
      ...meta.getState().working,
      document: { ...meta.getState().working.document, title: 'Queued behind the turn' },
    });
    let retirable = false;
    const waiting = registry.waitUntilRetirable(META_ID).then(() => {
      retirable = true;
    });

    expect(registry.release(META_ID)).toBe(false);
    await Promise.resolve();
    expect(retirable).toBe(false);
    expect(control.requests).toHaveLength(1);

    releaseCommit();
    await waiting;

    // The queued title committed before the Space was reported retirable.
    expect(control.requests).toHaveLength(2);
    expect(meta.getState().persistence.kind).toBe('settled');
    expect(registry.release(META_ID)).toBe(true);
    expect(registry.entry(META_ID)).toBeUndefined();
  });

  it('barrier: an idle Space waits out a coordination that has claimed its turn', async () => {
    const control = new MemorySpaceBackendTestControl();
    const releaseCommit = control.deferNextCommit();
    const registry = createSpaceSessionRegistry(
      new MemorySpaceBackend(
        META_ID,
        [
          { snapshot: metaSnapshot, revision: 3n, exportedRevision: null },
          { snapshot: targetSnapshot, revision: 7n, exportedRevision: null },
        ],
        control,
      ),
    );
    const meta = registry.open({ snapshot: metaSnapshot, revision: 3n, exportedRevision: null });
    const linking = registry.spaceResources(idSource([SPACE_RESOURCE_ID])).link({
      containingSpaceId: META_ID,
      mapId: META_MAP_ID,
      targetSpaceId: TARGET_ID,
      title: 'Link',
      position: { x: 240, y: 80 },
    });
    let retirable = false;
    const waiting = registry.waitUntilRetirable(META_ID).then(() => {
      retirable = true;
    });

    // Meta is idle with nothing queued, yet a coordination holds a turn it
    // will take part in.
    await Promise.resolve();
    await Promise.resolve();
    expect(retirable).toBe(false);

    await linking;
    releaseCommit();
    await waiting;
    expect(meta.getState().persistence.kind).toBe('settled');
  });

  it('barrier: an unopened Space is retirable and released at once', async () => {
    const registry = createSpaceSessionRegistry(
      new MemorySpaceBackend(META_ID, [
        { snapshot: metaSnapshot, revision: 3n, exportedRevision: null },
      ]),
    );

    await expect(registry.waitUntilRetirable(TARGET_ID)).resolves.toBeUndefined();
    expect(registry.release(TARGET_ID)).toBe(true);
  });

  it('barrier: a session with an ordinary commit in flight is not released', async () => {
    const control = new MemorySpaceBackendTestControl();
    const releaseCommit = control.deferNextCommit();
    const registry = createSpaceSessionRegistry(
      new MemorySpaceBackend(
        META_ID,
        [{ snapshot: metaSnapshot, revision: 3n, exportedRevision: null }],
        control,
      ),
    );
    const meta = registry.open({ snapshot: metaSnapshot, revision: 3n, exportedRevision: null });
    meta.submit({
      ...meta.getState().working,
      document: { ...meta.getState().working.document, title: 'In flight' },
    });

    expect(registry.release(META_ID)).toBe(false);
    releaseCommit();
    await registry.waitUntilRetirable(META_ID);
    expect(registry.release(META_ID)).toBe(true);
  });

  it('update: deleting the only Map is unchanged before any read or commit', async () => {
    class CountingAggregateBackend extends MemorySpaceBackend {
      loadAggregateCalls = 0;
      override loadAggregate(): ReturnType<MemorySpaceBackend['loadAggregate']> {
        this.loadAggregateCalls += 1;
        return super.loadAggregate();
      }
    }
    const control = new MemorySpaceBackendTestControl();
    const backend = new CountingAggregateBackend(
      META_ID,
      [{ snapshot: metaSnapshot, revision: 3n, exportedRevision: null }],
      control,
    );
    const registry = createSpaceSessionRegistry(backend);
    const meta = registry.open({ snapshot: metaSnapshot, revision: 3n, exportedRevision: null });

    await expect(
      registry
        .spaceResources(idSource([]))
        .deleteMap({ targetSpaceId: META_ID, mapId: META_MAP_ID, preferredMapId: null }),
    ).resolves.toEqual({ kind: 'unchanged' });

    expect(backend.loadAggregateCalls).toBe(0);
    expect(control.requests).toHaveLength(0);
    expect(meta.getState().working).toEqual(metaSnapshot);
  });

  it('update: deleting a Map of a Space that needs recovery is refused by name', async () => {
    const control = new MemorySpaceBackendTestControl();
    control.queueResult({ kind: 'retryable-failure', code: 'network' });
    const registry = createSpaceSessionRegistry(
      new MemorySpaceBackend(
        META_ID,
        [{ snapshot: metaSnapshot, revision: 3n, exportedRevision: null }],
        control,
      ),
    );
    const meta = registry.open({ snapshot: metaSnapshot, revision: 3n, exportedRevision: null });
    meta.submit(meta.getState().working);
    await vi.waitFor(() => expect(meta.getState().persistence.kind).toBe('failed'));

    await expect(
      registry
        .spaceResources(idSource([]))
        .deleteMap({ targetSpaceId: META_ID, mapId: META_MAP_ID, preferredMapId: null }),
    ).resolves.toEqual({
      kind: 'refused',
      refusal: { code: 'persistence-recovery-required', spaceId: META_ID, recovery: 'retry' },
    });
    expect(control.requests).toHaveLength(1);
  });

  it('unwind: a throw before any participant begins rejects the Edit and releases the barrier', async () => {
    const control = new MemorySpaceBackendTestControl();
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

    // Meta has no live session, so the Edit cannot read its containing Space.
    await expect(
      registry.spaceResources(idSource([SPACE_RESOURCE_ID])).link({
        containingSpaceId: META_ID,
        mapId: META_MAP_ID,
        targetSpaceId: TARGET_ID,
        title: 'Link',
        position: { x: 240, y: 80 },
      }),
    ).rejects.toThrow(`Space ${META_ID} has no live session`);

    expect(control.requests).toHaveLength(0);
    target.submit({
      ...target.getState().working,
      document: { ...target.getState().working.document, title: 'After the throw' },
    });
    await vi.waitFor(() => expect(target.getState().persistence.kind).toBe('settled'));
    expect(control.requests).toHaveLength(1);
  });

  it('unwind: a thrown commit leaves every participant recoverable by one later Edit', async () => {
    const control = new MemorySpaceBackendTestControl();
    control.throwNext(new Error('transport exploded'));
    const registry = createSpaceSessionRegistry(
      new MemorySpaceBackend(
        META_ID,
        [{ snapshot: metaSnapshot, revision: 3n, exportedRevision: null }],
        control,
      ),
    );
    const meta = registry.open({ snapshot: metaSnapshot, revision: 3n, exportedRevision: null });

    await expect(registry.spaceResources(createIds()).create(createInput)).resolves.toEqual({
      kind: 'completed',
      resourceId: SPACE_RESOURCE_ID,
    });
    await vi.waitFor(() => expect(meta.getState().persistence.kind).toBe('rejected'));
    expect(registry.entry(TARGET_ID)).toMatchObject({ kind: 'session' });

    meta.submit({
      ...meta.getState().working,
      document: { ...meta.getState().working.document, title: 'After the throw' },
    });
    await vi.waitFor(() => expect(meta.getState().persistence.kind).toBe('settled'));

    expect(control.requests).toHaveLength(2);
    expect(control.requests[1]?.changes).toMatchObject([
      { kind: 'update', spaceId: META_ID, snapshot: { document: { title: 'After the throw' } } },
      { kind: 'create', spaceId: TARGET_ID },
    ]);
    expect(registry.session(TARGET_ID)?.getState().persistence.kind).toBe('settled');
  });

  it.each([
    { outcome: 'committed', result: undefined, thrown: false },
    {
      outcome: 'failed',
      result: { kind: 'retryable-failure', code: 'network' } as const,
      thrown: false,
    },
    {
      outcome: 'rejected',
      result: { kind: 'permanent-failure', code: 'forbidden' } as const,
      thrown: false,
    },
    {
      outcome: 'conflicted',
      result: {
        kind: 'conflict',
        conflicts: [
          {
            spaceId: META_ID,
            current: { snapshot: metaSnapshot, revision: 9n, exportedRevision: null },
          },
        ],
      } as const,
      thrown: false,
    },
    {
      outcome: 'malformed',
      result: {
        kind: 'committed',
        revisions: [{ spaceId: META_ID, revision: 4n }],
        deletedSpaceIds: [],
      } as const,
      thrown: false,
    },
    { outcome: 'thrown', result: undefined, thrown: true },
  ])(
    'provisional: a created Space is no longer provisional once the commit is $outcome',
    async ({ result, thrown }) => {
      const control = new MemorySpaceBackendTestControl();
      if (result !== undefined) control.queueResult(result);
      if (thrown) control.throwNext(new Error('transport exploded'));
      const releaseCommit = control.deferNextCommit();
      const registry = createSpaceSessionRegistry(
        new MemorySpaceBackend(
          META_ID,
          [{ snapshot: metaSnapshot, revision: 3n, exportedRevision: null }],
          control,
        ),
      );
      const meta = registry.open({ snapshot: metaSnapshot, revision: 3n, exportedRevision: null });

      await registry.spaceResources(createIds()).create(createInput);
      // While the commit is in flight the created Space is a live participant.
      expect(registry.entry(TARGET_ID)).toMatchObject({ kind: 'session' });
      expect(registry.release(TARGET_ID)).toBe(false);

      releaseCommit();
      await registry.waitUntilRetirable(META_ID);
      await registry.waitUntilRetirable(TARGET_ID);
      expect(meta.getState().persistence.kind).not.toBe('pending');

      // Retiring the session leaves nothing behind: a provisional entry would
      // surface here and refuse the reopen below.
      if (registry.session(TARGET_ID) !== undefined) {
        expect(registry.release(TARGET_ID)).toBe(true);
      }
      expect(registry.entry(TARGET_ID)).toBeUndefined();
      expect(() =>
        registry.open({ snapshot: targetSnapshot, revision: 0n, exportedRevision: null }),
      ).not.toThrow();
    },
  );

  it('keep-local: a deleted participant the conflict reports absent is completed, and the rest retried', async () => {
    const control = new MemorySpaceBackendTestControl();
    control.queueResult({
      kind: 'conflict',
      conflicts: [{ spaceId: TARGET_ID, current: undefined }],
    });
    const backend = new MemorySpaceBackend(
      META_ID,
      [
        { snapshot: linkedMeta, revision: 3n, exportedRevision: null },
        { snapshot: targetSnapshot, revision: 7n, exportedRevision: null },
      ],
      control,
    );
    const registry = createSpaceSessionRegistry(backend);
    const meta = registry.open({ snapshot: linkedMeta, revision: 3n, exportedRevision: null });

    await expect(
      registry
        .spaceResources(idSource([]))
        .delete({ containingSpaceId: META_ID, resourceId: SPACE_RESOURCE_ID }),
    ).resolves.toEqual({ kind: 'completed' });
    await vi.waitFor(() => expect(meta.getState().persistence.kind).toBe('conflicted'));
    expect(registry.session(TARGET_ID)?.getState().persistence).toMatchObject({
      kind: 'conflicted',
      current: undefined,
    });
    control.queueResult({
      kind: 'committed',
      revisions: [{ spaceId: META_ID, revision: 4n }],
      deletedSpaceIds: [],
    });

    meta.resolveConflict(meta.getState().working);
    await vi.waitFor(() => expect(meta.getState().persistence.kind).toBe('settled'));

    expect(registry.session(TARGET_ID)).toBeUndefined();
    expect(control.requests).toHaveLength(2);
    expect(control.requests[1]?.changes).toMatchObject([
      { kind: 'update', spaceId: META_ID, expectedRevision: 3n },
    ]);
    expect(control.requests[1]?.changes).toHaveLength(1);
  });
});

/** A memory backend whose next aggregate reads can be held or refused. */
class ScriptedAggregateBackend extends MemorySpaceBackend {
  loadAggregateCalls = 0;
  readonly #failures: Error[] = [];
  readonly #gates: Promise<void>[] = [];

  failNextLoad(error: Error): void {
    this.#failures.push(error);
  }

  deferNextLoad(): () => void {
    const gate = Promise.withResolvers<undefined>();
    this.#gates.push(gate.promise.then(() => undefined));
    return () => {
      gate.resolve(undefined);
    };
  }

  override async loadAggregate(): ReturnType<MemorySpaceBackend['loadAggregate']> {
    this.loadAggregateCalls += 1;
    await this.#gates.shift();
    const failure = this.#failures.shift();
    if (failure !== undefined) throw failure;
    return super.loadAggregate();
  }
}

describe('Space Resource recovery after a replay that never installed', () => {
  const createInput = {
    containingSpaceId: META_ID,
    mapId: META_MAP_ID,
    title: 'Architecture',
    position: { x: 240, y: 80 },
  };
  const committedBoth = {
    kind: 'committed',
    revisions: [
      { spaceId: META_ID, revision: 4n },
      { spaceId: TARGET_ID, revision: 0n },
    ],
    deletedSpaceIds: [],
  } as const;

  /** A created Space Resource whose coordinated commit answered `first`. */
  const failedCreate = async (
    first: Parameters<MemorySpaceBackendTestControl['queueResult']>[0],
  ) => {
    const control = new MemorySpaceBackendTestControl();
    control.queueResult(first);
    const backend = new ScriptedAggregateBackend(
      META_ID,
      [{ snapshot: metaSnapshot, revision: 3n, exportedRevision: null }],
      control,
    );
    const registry = createSpaceSessionRegistry(backend);
    const meta = registry.open({ snapshot: metaSnapshot, revision: 3n, exportedRevision: null });
    await registry
      .spaceResources(
        idSource([
          TARGET_ID,
          TARGET_RESOURCE_ID,
          TARGET_MAP_ID,
          TARGET_GRAPH_ID,
          SPACE_RESOURCE_ID,
        ]),
      )
      .create(createInput);
    await registry.waitUntilRetirable(META_ID);
    const target = registry.session(TARGET_ID);
    if (target === undefined) throw new Error('target session was not installed');
    return { control, backend, registry, meta, target };
  };

  it('retries every participant together once the backend is back, after a replay read failed', async () => {
    const { control, backend, registry, meta, target } = await failedCreate({
      kind: 'retryable-failure',
      code: 'network',
    });
    expect(meta.getState().persistence.kind).toBe('failed');

    backend.failNextLoad(new Error('aggregate read refused'));
    meta.retry();
    await registry.waitUntilRetirable(META_ID);

    expect(backend.loadAggregateCalls).toBe(2);
    expect(control.requests).toHaveLength(1);
    expect(meta.getState().persistence.kind).toBe('failed');
    expect(target.getState().persistence.kind).toBe('failed');
    expect(registry.entry(TARGET_ID)).toMatchObject({ kind: 'session' });

    meta.submit({
      ...meta.getState().working,
      document: { ...meta.getState().working.document, title: 'Later local title' },
    });
    control.queueResult(committedBoth);
    meta.retry();
    await registry.waitUntilRetirable(META_ID);

    expect(backend.loadAggregateCalls).toBe(3);
    expect(control.requests).toHaveLength(2);
    expect(control.requests[1]?.changes).toMatchObject([
      { kind: 'update', spaceId: META_ID, snapshot: { document: { title: 'Later local title' } } },
      { kind: 'create', spaceId: TARGET_ID },
    ]);
    expect(meta.getState()).toMatchObject({
      acknowledgedRevision: 4n,
      persistence: { kind: 'settled' },
    });
    expect(target.getState().persistence.kind).toBe('settled');
    expect(registry.entry(TARGET_ID)).toMatchObject({ kind: 'session' });
  });

  it('keeps local work across every participant once the backend is back, after a replay read failed', async () => {
    const { control, backend, registry, meta, target } = await failedCreate({
      kind: 'conflict',
      conflicts: [
        {
          spaceId: META_ID,
          current: { snapshot: metaSnapshot, revision: 9n, exportedRevision: null },
        },
      ],
    });
    expect(meta.getState().persistence.kind).toBe('conflicted');

    backend.failNextLoad(new Error('aggregate read refused'));
    target.resolveConflict(target.getState().working);
    await registry.waitUntilRetirable(TARGET_ID);

    expect(backend.loadAggregateCalls).toBe(2);
    expect(control.requests).toHaveLength(1);
    expect(meta.getState().persistence.kind).toBe('conflicted');
    expect(target.getState().persistence.kind).toBe('conflicted');

    control.queueResult({
      kind: 'committed',
      revisions: [
        { spaceId: META_ID, revision: 10n },
        { spaceId: TARGET_ID, revision: 0n },
      ],
      deletedSpaceIds: [],
    });
    target.resolveConflict(target.getState().working);
    await registry.waitUntilRetirable(TARGET_ID);

    expect(control.requests).toHaveLength(2);
    expect(control.requests[1]?.changes).toMatchObject([
      { kind: 'update', spaceId: META_ID, expectedRevision: 9n },
      { kind: 'create', spaceId: TARGET_ID },
    ]);
    expect(meta.getState()).toMatchObject({
      acknowledgedRevision: 10n,
      persistence: { kind: 'settled' },
    });
    expect(target.getState().persistence.kind).toBe('settled');
  });

  it('replays once for recovery requests pressed while a replay is still reading', async () => {
    const { control, backend, registry, meta, target } = await failedCreate({
      kind: 'retryable-failure',
      code: 'network',
    });
    const releaseRead = backend.deferNextLoad();
    control.queueResult(committedBoth);

    meta.retry();
    meta.retry();
    target.retry();
    releaseRead();
    await registry.waitUntilRetirable(META_ID);

    expect(backend.loadAggregateCalls).toBe(2);
    expect(control.requests).toHaveLength(2);
    expect(meta.getState().persistence.kind).toBe('settled');
    expect(target.getState().persistence.kind).toBe('settled');
  });

  it('answers a replay that throws before installing by leaving recovery usable and the barrier down', async () => {
    const { control, backend, registry, target } = await failedCreate({
      kind: 'retryable-failure',
      code: 'network',
    });
    // A failed participant is idle, so its owner may retire it; the replay
    // then names a Space with no live session and throws before enlisting.
    expect(registry.release(META_ID)).toBe(true);

    target.retry();
    await registry.waitUntilRetirable(TARGET_ID);

    expect(backend.loadAggregateCalls).toBe(2);
    expect(control.requests).toHaveLength(1);
    expect(target.getState().persistence.kind).toBe('failed');

    // The barrier is down: an ordinary Space opened now commits on its own.
    const reopened = registry.open({
      snapshot: metaSnapshot,
      revision: 3n,
      exportedRevision: null,
    });
    reopened.submit({
      ...metaSnapshot,
      document: { ...metaSnapshot.document, title: 'After the thrown replay' },
    });
    await registry.waitUntilRetirable(META_ID);
    expect(reopened.getState().persistence.kind).toBe('settled');
    expect(control.requests).toHaveLength(2);

    // And the stranded participant's recovery is asked for again, not ignored.
    target.retry();
    await registry.waitUntilRetirable(TARGET_ID);
    expect(backend.loadAggregateCalls).toBe(3);
  });
});
