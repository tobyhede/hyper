import { describe, expect, it, vi } from 'vitest';
import { uuidSchema, type SpaceSnapshot, type UUID } from '@project/core';
import { MemorySpaceBackend, MemorySpaceBackendTestControl } from '../src/memory';
import { createSpaceSessionRegistry } from '../src/session-registry';

const META_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const META_THING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const META_DIAGRAM_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const META_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const TARGET_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000010');
const TARGET_THING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000011');
const TARGET_DIAGRAM_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000012');
const TARGET_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000013');
const SPACE_THING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000014');
const SECOND_SPACE_THING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000015');
const CHILD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000016');
const CHILD_THING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000017');
const CHILD_LINK_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000018');
const CHILD_DIAGRAM_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000019');
const CHILD_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-00000000001a');
const SECOND_TARGET_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-00000000001b');

class ThrowingAggregateBackend extends MemorySpaceBackend {
  throwNextLoad = true;

  override loadAggregate(): ReturnType<MemorySpaceBackend['loadAggregate']> {
    if (this.throwNextLoad) {
      this.throwNextLoad = false;
      return Promise.reject(new Error('aggregate transport exploded'));
    }
    return super.loadAggregate();
  }
}

const metaSnapshot: SpaceSnapshot = {
  id: META_ID,
  document: {
    version: 1,
    title: 'Meta',
    defaultDiagram: META_DIAGRAM_ID,
    diagrams: [
      {
        id: META_DIAGRAM_ID,
        title: 'Diagram 1',
        kind: 'positioned',
        positions: { [META_THING_ID]: { x: 0, y: 0, open: false } },
        graphs: [{ id: META_GRAPH_ID, title: 'Graph 1', edges: [] }],
        activeGraph: META_GRAPH_ID,
      },
    ],
  },
  things: [
    {
      id: META_THING_ID,
      document: { title: 'Meta', kind: 'markdown', body: '' },
    },
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

const targetSnapshot: SpaceSnapshot = {
  id: TARGET_ID,
  document: {
    version: 1,
    title: 'Architecture',
    defaultDiagram: TARGET_DIAGRAM_ID,
    diagrams: [
      {
        id: TARGET_DIAGRAM_ID,
        title: 'Diagram 1',
        kind: 'positioned',
        positions: { [TARGET_THING_ID]: { x: 0, y: 0, open: false } },
        graphs: [{ id: TARGET_GRAPH_ID, title: 'Graph 1', edges: [] }],
        activeGraph: TARGET_GRAPH_ID,
      },
    ],
  },
  things: [
    {
      id: TARGET_THING_ID,
      document: { title: 'Architecture', kind: 'markdown', body: '' },
    },
  ],
};

describe('Space Thing lifecycle', () => {
  it.each(['create', 'link'] as const)(
    'reports a thrown coordination read asynchronously for %s and releases the barrier',
    async (operation) => {
      const sourceSnapshot: SpaceSnapshot =
        operation === 'link'
          ? {
              ...metaSnapshot,
              things: [
                ...metaSnapshot.things,
                {
                  id: SECOND_SPACE_THING_ID,
                  document: {
                    title: 'Existing target',
                    kind: 'space',
                    spaceId: TARGET_ID,
                    diagram: TARGET_DIAGRAM_ID,
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
      const lifecycle = registry.spaceThings(
        idSource(
          operation === 'create'
            ? [TARGET_ID, TARGET_THING_ID, TARGET_DIAGRAM_ID, TARGET_GRAPH_ID, SPACE_THING_ID]
            : [SPACE_THING_ID],
        ),
      );

      const result =
        operation === 'create'
          ? await lifecycle.create({
              containingSpaceId: META_ID,
              diagramId: META_DIAGRAM_ID,
              title: 'Architecture',
              position: { x: 240, y: 80 },
            })
          : await lifecycle.link({
              containingSpaceId: META_ID,
              diagramId: META_DIAGRAM_ID,
              targetSpaceId: TARGET_ID,
              title: 'Architecture',
              position: { x: 240, y: 80 },
            });

      expect(result).toEqual({
        kind: 'refused',
        refusal: { code: 'persistence-read-failed' },
      });
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
            things: sourceSnapshot.things,
          },
        },
      ]);
    },
  );

  it('reports a thrown delete-derivation read asynchronously and releases the barrier', async () => {
    const linkedMeta: SpaceSnapshot = {
      ...metaSnapshot,
      things: [
        ...metaSnapshot.things,
        {
          id: SPACE_THING_ID,
          document: {
            title: 'Target',
            kind: 'space',
            spaceId: TARGET_ID,
            diagram: TARGET_DIAGRAM_ID,
            graph: TARGET_GRAPH_ID,
          },
        },
      ],
      document: {
        ...metaSnapshot.document,
        diagrams: metaSnapshot.document.diagrams?.map((diagram) => ({
          ...diagram,
          positions: {
            ...diagram.positions,
            [SPACE_THING_ID]: { x: 240, y: 80, open: false },
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
    const lifecycle = registry.spaceThings(idSource([]));

    await expect(
      lifecycle.delete({ containingSpaceId: META_ID, thingId: SPACE_THING_ID }),
    ).resolves.toEqual({
      kind: 'refused',
      refusal: { code: 'persistence-read-failed' },
    });
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
          things: linkedMeta.things,
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
    const lifecycle = registry.spaceThings(idSource([SPACE_THING_ID, SECOND_SPACE_THING_ID]));

    await lifecycle.link({
      containingSpaceId: META_ID,
      diagramId: META_DIAGRAM_ID,
      targetSpaceId: TARGET_ID,
      title: 'First',
      position: { x: 240, y: 80 },
    });
    const second = lifecycle.link({
      containingSpaceId: META_ID,
      diagramId: META_DIAGRAM_ID,
      targetSpaceId: TARGET_ID,
      title: 'Second',
      position: { x: 480, y: 80 },
    });

    expect(meta.getState().working.things).toHaveLength(2);
    expect(control.requests).toHaveLength(1);
    release();
    await second;
    expect(meta.getState().working.things).toHaveLength(3);
    await vi.waitFor(() => expect(control.requests).toHaveLength(2));
  });

  it('validates against the latest working snapshot of every open Space', async () => {
    const backend = new MemorySpaceBackend(META_ID, [
      { snapshot: metaSnapshot, revision: 3n, exportedRevision: null },
      { snapshot: targetSnapshot, revision: 7n, exportedRevision: null },
    ]);
    const registry = createSpaceSessionRegistry(backend);
    const meta = registry.open({ snapshot: metaSnapshot, revision: 3n, exportedRevision: null });
    const target = registry.open({
      snapshot: targetSnapshot,
      revision: 7n,
      exportedRevision: null,
    });
    target.submit({
      ...target.getState().working,
      things: [
        ...target.getState().working.things,
        {
          id: CHILD_LINK_ID,
          document: {
            title: 'Unsaved child',
            kind: 'space',
            spaceId: CHILD_ID,
            diagram: CHILD_DIAGRAM_ID,
            graph: CHILD_GRAPH_ID,
          },
        },
      ],
    });
    await vi.waitFor(() => expect(target.getState().persistence.kind).toBe('rejected'));
    const lifecycle = registry.spaceThings(idSource([SPACE_THING_ID]));

    await expect(
      lifecycle.link({
        containingSpaceId: META_ID,
        diagramId: META_DIAGRAM_ID,
        targetSpaceId: TARGET_ID,
        title: 'Link',
        position: { x: 240, y: 80 },
      }),
    ).resolves.toMatchObject({
      kind: 'refused',
      refusal: {
        code: 'aggregate-refused',
        errors: [{ kind: 'space-thing-target-missing' }],
      },
    });
    expect(meta.getState().working).toEqual(metaSnapshot);
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
    const lifecycle = registry.spaceThings(idSource([SPACE_THING_ID]));

    await lifecycle.link({
      containingSpaceId: META_ID,
      diagramId: META_DIAGRAM_ID,
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
      result: { kind: 'retryable-failure', code: 'network', message: 'offline' } as const,
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
      const lifecycle = registry.spaceThings(idSource([SPACE_THING_ID]));

      await expect(
        lifecycle.link({
          containingSpaceId: META_ID,
          diagramId: META_DIAGRAM_ID,
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
      things: [
        ...metaSnapshot.things,
        {
          id: SPACE_THING_ID,
          document: {
            title: 'Target',
            kind: 'space',
            spaceId: TARGET_ID,
            diagram: TARGET_DIAGRAM_ID,
            graph: TARGET_GRAPH_ID,
          },
        },
      ],
      document: {
        ...metaSnapshot.document,
        diagrams: metaSnapshot.document.diagrams?.map((diagram) => ({
          ...diagram,
          positions: {
            ...diagram.positions,
            [SPACE_THING_ID]: { x: 240, y: 80, open: false },
          },
        })),
      },
    };
    const control = new MemorySpaceBackendTestControl();
    // The conflict names the cascade's target only. Meta is a participant
    // because the same edit removes its Space Thing, but the repository never
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
    const lifecycle = registry.spaceThings(idSource([]));

    await lifecycle.delete({ containingSpaceId: META_ID, thingId: SPACE_THING_ID });
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
      things: [
        ...metaSnapshot.things,
        {
          id: SPACE_THING_ID,
          document: {
            title: 'Target',
            kind: 'space',
            spaceId: TARGET_ID,
            diagram: TARGET_DIAGRAM_ID,
            graph: TARGET_GRAPH_ID,
          },
        },
      ],
      document: {
        ...metaSnapshot.document,
        diagrams: metaSnapshot.document.diagrams?.map((diagram) => ({
          ...diagram,
          positions: {
            ...diagram.positions,
            [SPACE_THING_ID]: { x: 240, y: 80, open: false },
          },
        })),
      },
    };
    const control = new MemorySpaceBackendTestControl();
    control.queueResult({ kind: 'retryable-failure', code: 'network', message: 'offline' });
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
    const lifecycle = registry.spaceThings(idSource([]));

    await expect(
      lifecycle.delete({ containingSpaceId: META_ID, thingId: SPACE_THING_ID }),
    ).resolves.toEqual({
      kind: 'refused',
      refusal: { code: 'persistence-recovery-required', spaceId: TARGET_ID, recovery: 'retry' },
    });
    expect(meta.getState().working).toEqual(linkedMeta);
    expect(control.requests).toHaveLength(1);
  });

  it.each([
    {
      result: { kind: 'permanent-failure', code: 'invalid-commit', message: 'refused' } as const,
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
    const lifecycle = registry.spaceThings(
      idSource([TARGET_ID, TARGET_THING_ID, TARGET_DIAGRAM_ID, TARGET_GRAPH_ID, SPACE_THING_ID]),
    );

    await lifecycle.create({
      containingSpaceId: META_ID,
      diagramId: META_DIAGRAM_ID,
      title: 'Architecture',
      position: { x: 240, y: 80 },
    });
    await vi.waitFor(() => expect(meta.getState().persistence.kind).toBe(state));

    expect(registry.session(TARGET_ID)?.getState().persistence.kind).toBe(state);
    expect(mismatchedPublications).toEqual([]);
  });

  it('releases the barrier and rejects every participant when the backend throws', async () => {
    const control = new MemorySpaceBackendTestControl();
    control.throwNext(new Error('transport exploded'));
    const backend = new MemorySpaceBackend(
      META_ID,
      [{ snapshot: metaSnapshot, revision: 3n, exportedRevision: null }],
      control,
    );
    const registry = createSpaceSessionRegistry(backend);
    const meta = registry.open({ snapshot: metaSnapshot, revision: 3n, exportedRevision: null });
    const lifecycle = registry.spaceThings(
      idSource([TARGET_ID, TARGET_THING_ID, TARGET_DIAGRAM_ID, TARGET_GRAPH_ID, SPACE_THING_ID]),
    );

    await lifecycle.create({
      containingSpaceId: META_ID,
      diagramId: META_DIAGRAM_ID,
      title: 'Architecture',
      position: { x: 240, y: 80 },
    });
    await vi.waitFor(() => expect(meta.getState().persistence.kind).toBe('rejected'));

    expect(registry.session(TARGET_ID)?.getState().persistence.kind).toBe('rejected');
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
    const lifecycle = registry.spaceThings(
      idSource([TARGET_ID, TARGET_THING_ID, TARGET_DIAGRAM_ID, TARGET_GRAPH_ID, SPACE_THING_ID]),
    );

    await lifecycle.create({
      containingSpaceId: META_ID,
      diagramId: META_DIAGRAM_ID,
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
    const lifecycle = registry.spaceThings(
      idSource([TARGET_ID, TARGET_THING_ID, TARGET_DIAGRAM_ID, TARGET_GRAPH_ID, SPACE_THING_ID]),
    );
    await lifecycle.create({
      containingSpaceId: META_ID,
      diagramId: META_DIAGRAM_ID,
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
    const lifecycle = registry.spaceThings(
      idSource([TARGET_ID, TARGET_THING_ID, TARGET_DIAGRAM_ID, TARGET_GRAPH_ID, SPACE_THING_ID]),
    );
    await lifecycle.create({
      containingSpaceId: META_ID,
      diagramId: META_DIAGRAM_ID,
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
    const lifecycle = registry.spaceThings(idSource([SPACE_THING_ID]));
    await lifecycle.link({
      containingSpaceId: META_ID,
      diagramId: META_DIAGRAM_ID,
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
    const lifecycle = registry.spaceThings(idSource([SPACE_THING_ID]));
    await lifecycle.link({
      containingSpaceId: META_ID,
      diagramId: META_DIAGRAM_ID,
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
    control.queueResult({ kind: 'retryable-failure', code: 'network', message: 'offline' });
    const backend = new MemorySpaceBackend(
      META_ID,
      [{ snapshot: metaSnapshot, revision: 3n, exportedRevision: null }],
      control,
    );
    const registry = createSpaceSessionRegistry(backend);
    const meta = registry.open({ snapshot: metaSnapshot, revision: 3n, exportedRevision: null });
    const lifecycle = registry.spaceThings(
      idSource([TARGET_ID, TARGET_THING_ID, TARGET_DIAGRAM_ID, TARGET_GRAPH_ID, SPACE_THING_ID]),
    );

    await lifecycle.create({
      containingSpaceId: META_ID,
      diagramId: META_DIAGRAM_ID,
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
    control.queueResult({ kind: 'permanent-failure', code: 'forbidden', message: 'denied' });
    const backend = new MemorySpaceBackend(
      META_ID,
      [{ snapshot: metaSnapshot, revision: 3n, exportedRevision: null }],
      control,
    );
    const registry = createSpaceSessionRegistry(backend);
    const meta = registry.open({ snapshot: metaSnapshot, revision: 3n, exportedRevision: null });
    const lifecycle = registry.spaceThings(
      idSource([TARGET_ID, TARGET_THING_ID, TARGET_DIAGRAM_ID, TARGET_GRAPH_ID, SPACE_THING_ID]),
    );
    await lifecycle.create({
      containingSpaceId: META_ID,
      diagramId: META_DIAGRAM_ID,
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

  it('atomically creates the first Space Thing and its normal target Space', async () => {
    const backend = new MemorySpaceBackend(META_ID, [
      { snapshot: metaSnapshot, revision: 3n, exportedRevision: null },
    ]);
    const registry = createSpaceSessionRegistry(backend);
    registry.open({ snapshot: metaSnapshot, revision: 3n, exportedRevision: null });
    const lifecycle = registry.spaceThings(
      idSource([TARGET_ID, TARGET_THING_ID, TARGET_DIAGRAM_ID, TARGET_GRAPH_ID, SPACE_THING_ID]),
    );

    await expect(
      lifecycle.create({
        containingSpaceId: META_ID,
        diagramId: META_DIAGRAM_ID,
        title: 'Architecture',
        position: { x: 240, y: 80 },
      }),
    ).resolves.toEqual({ kind: 'completed', thingId: SPACE_THING_ID });

    const result = await backend.loadAggregate();
    if (result.kind === 'uninitialized') throw new Error('Test backend is uninitialized');
    const aggregate = result.aggregate;
    expect(aggregate.spaces).toHaveLength(2);
    const storedMeta = await backend.loadSpace(META_ID);
    expect(storedMeta?.revision).toBe(4n);
    expect(storedMeta?.snapshot.things).toContainEqual({
      id: SPACE_THING_ID,
      document: {
        title: 'Architecture',
        kind: 'space',
        spaceId: TARGET_ID,
        // The Diagram and Graph initialization minted for the target it just
        // made, kept rather than discarded (ADR 0079). A created Space Thing
        // stores a selection from the moment it exists, and the only Diagram in
        // existence for a Space one Edit old is the one that Edit authored.
        diagram: TARGET_DIAGRAM_ID,
        graph: TARGET_GRAPH_ID,
      },
    });
    expect(storedMeta?.snapshot.document.diagrams?.[0]?.positions[SPACE_THING_ID]).toEqual({
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
          defaultDiagram: TARGET_DIAGRAM_ID,
          diagrams: [
            {
              id: TARGET_DIAGRAM_ID,
              title: 'Diagram 1',
              kind: 'positioned',
              positions: { [TARGET_THING_ID]: { x: 0, y: 0, open: false } },
              graphs: [{ id: TARGET_GRAPH_ID, title: 'Graph 1', edges: [] }],
              activeGraph: TARGET_GRAPH_ID,
            },
          ],
        },
        things: [
          {
            // The typed title names the *Space*. Its first Thing takes the same
            // neutral `Thing 1` every new Space's first Thing takes, because the
            // two are independent from the moment they exist (ADR 0068).
            id: TARGET_THING_ID,
            document: { title: 'Thing 1', kind: 'markdown', body: '' },
          },
        ],
      },
    });
  });

  it('links an existing Space and deletes its target only after the last reference is removed', async () => {
    const linkedMeta: SpaceSnapshot = {
      ...metaSnapshot,
      things: [
        ...metaSnapshot.things,
        {
          id: SPACE_THING_ID,
          document: {
            title: 'First link',
            kind: 'space',
            spaceId: TARGET_ID,
            diagram: TARGET_DIAGRAM_ID,
            graph: TARGET_GRAPH_ID,
          },
        },
      ],
      document: {
        ...metaSnapshot.document,
        diagrams: metaSnapshot.document.diagrams?.map((diagram) => ({
          ...diagram,
          positions: {
            ...diagram.positions,
            [SPACE_THING_ID]: { x: 240, y: 80, open: false },
          },
        })),
      },
    };
    const targetWithChild: SpaceSnapshot = {
      ...targetSnapshot,
      things: [
        ...targetSnapshot.things,
        {
          id: CHILD_LINK_ID,
          document: {
            title: 'Child',
            kind: 'space',
            spaceId: CHILD_ID,
            diagram: CHILD_DIAGRAM_ID,
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
        defaultDiagram: CHILD_DIAGRAM_ID,
        diagrams: [
          {
            id: CHILD_DIAGRAM_ID,
            title: 'Diagram 1',
            kind: 'positioned',
            positions: { [CHILD_THING_ID]: { x: 0, y: 0, open: false } },
            graphs: [{ id: CHILD_GRAPH_ID, title: 'Graph 1', edges: [] }],
            activeGraph: CHILD_GRAPH_ID,
          },
        ],
      },
      things: [
        {
          id: CHILD_THING_ID,
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
    const lifecycle = registry.spaceThings(idSource([SECOND_SPACE_THING_ID]));

    await expect(
      lifecycle.link({
        containingSpaceId: META_ID,
        diagramId: META_DIAGRAM_ID,
        targetSpaceId: TARGET_ID,
        title: 'Second link',
        position: { x: 480, y: 80 },
      }),
    ).resolves.toEqual({ kind: 'completed', thingId: SECOND_SPACE_THING_ID });

    await expect(
      lifecycle.delete({ containingSpaceId: META_ID, thingId: SPACE_THING_ID }),
    ).resolves.toEqual({ kind: 'completed' });
    expect(await backend.loadSpace(TARGET_ID)).toMatchObject({ revision: 7n });

    await expect(
      lifecycle.delete({ containingSpaceId: META_ID, thingId: SECOND_SPACE_THING_ID }),
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
    // One identity, and it is the Thing's. A target that already opens on a
    // Diagram has nothing left for this Edit to mint (ADR 0079), and an
    // exhausted source throws rather than quietly handing out a real id — so
    // the count is asserted by the source rather than by a spy.
    const lifecycle = registry.spaceThings(idSource([SPACE_THING_ID]));

    await expect(
      lifecycle.link({
        containingSpaceId: META_ID,
        diagramId: META_DIAGRAM_ID,
        targetSpaceId: TARGET_ID,
        title: 'Architecture',
        position: { x: 240, y: 80 },
      }),
    ).resolves.toEqual({ kind: 'completed', thingId: SPACE_THING_ID });

    const storedMeta = await backend.loadSpace(META_ID);
    expect(storedMeta?.snapshot.things).toContainEqual({
      id: SPACE_THING_ID,
      document: {
        title: 'Architecture',
        kind: 'space',
        spaceId: TARGET_ID,
        diagram: TARGET_DIAGRAM_ID,
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

  it('durably initializes a stored diagramless target before the Thing that selects it exists', async () => {
    const diagramlessTarget: SpaceSnapshot = {
      id: TARGET_ID,
      document: { version: 1, title: 'Architecture' },
      things: [
        {
          id: TARGET_THING_ID,
          document: { title: 'Architecture', kind: 'markdown', body: '' },
        },
      ],
    };
    const control = new MemorySpaceBackendTestControl();
    const backend = new MemorySpaceBackend(
      META_ID,
      [
        { snapshot: metaSnapshot, revision: 3n, exportedRevision: null },
        { snapshot: diagramlessTarget, revision: 7n, exportedRevision: null },
      ],
      control,
    );
    const registry = createSpaceSessionRegistry(backend);
    registry.open({ snapshot: metaSnapshot, revision: 3n, exportedRevision: null });
    // The Diagram and the Graph initialization mints, in that order, and only
    // then the Thing's own id. Initialization runs before the Edit rather than
    // inside it, so an id source written in any other order is exhausted at the
    // draw that proves it (ADR 0016, ADR 0079).
    const lifecycle = registry.spaceThings(
      idSource([TARGET_DIAGRAM_ID, TARGET_GRAPH_ID, SPACE_THING_ID]),
    );

    await expect(
      lifecycle.link({
        containingSpaceId: META_ID,
        diagramId: META_DIAGRAM_ID,
        targetSpaceId: TARGET_ID,
        title: 'Architecture',
        position: { x: 240, y: 80 },
      }),
    ).resolves.toEqual({ kind: 'completed', thingId: SPACE_THING_ID });

    // Durable by the time the lifecycle answers, in its own commit: the target
    // carries the complete Diagram rather than a selection only the Thing
    // remembers.
    expect(await backend.loadSpace(TARGET_ID)).toEqual({
      revision: 8n,
      exportedRevision: null,
      snapshot: {
        ...diagramlessTarget,
        document: {
          version: 1,
          title: 'Architecture',
          defaultDiagram: TARGET_DIAGRAM_ID,
          diagrams: [
            {
              id: TARGET_DIAGRAM_ID,
              title: 'Diagram 1',
              kind: 'positioned',
              positions: {},
              graphs: [{ id: TARGET_GRAPH_ID, title: 'Graph 1', edges: [] }],
              activeGraph: TARGET_GRAPH_ID,
            },
          ],
        },
      },
    });
    const storedMeta = await backend.loadSpace(META_ID);
    expect(storedMeta?.snapshot.things).toContainEqual({
      id: SPACE_THING_ID,
      document: {
        title: 'Architecture',
        kind: 'space',
        spaceId: TARGET_ID,
        diagram: TARGET_DIAGRAM_ID,
        graph: TARGET_GRAPH_ID,
      },
    });
  });

  it("selects the Diagram's authored Active Graph rather than the head of its list", async () => {
    const targetWithLaterActiveGraph: SpaceSnapshot = {
      ...targetSnapshot,
      document: {
        ...targetSnapshot.document,
        diagrams: [
          {
            id: TARGET_DIAGRAM_ID,
            title: 'Diagram 1',
            kind: 'positioned',
            positions: { [TARGET_THING_ID]: { x: 0, y: 0, open: false } },
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
    const lifecycle = registry.spaceThings(idSource([SPACE_THING_ID]));

    await expect(
      lifecycle.link({
        containingSpaceId: META_ID,
        diagramId: META_DIAGRAM_ID,
        targetSpaceId: TARGET_ID,
        title: 'Architecture',
        position: { x: 240, y: 80 },
      }),
    ).resolves.toEqual({ kind: 'completed', thingId: SPACE_THING_ID });

    // The head of `graphs` is what an *unauthored* `activeGraph` falls back to,
    // so a target that has authored one is the case that tells the rule from
    // the fallback (ADR 0026).
    const storedMeta = await backend.loadSpace(META_ID);
    expect(storedMeta?.snapshot.things).toContainEqual({
      id: SPACE_THING_ID,
      document: {
        title: 'Architecture',
        kind: 'space',
        spaceId: TARGET_ID,
        diagram: TARGET_DIAGRAM_ID,
        graph: SECOND_TARGET_GRAPH_ID,
      },
    });
  });

  it('refuses a link whose target could not be initialized and authors nothing', async () => {
    const diagramlessTarget: SpaceSnapshot = {
      id: TARGET_ID,
      document: { version: 1, title: 'Architecture' },
      things: [
        {
          id: TARGET_THING_ID,
          document: { title: 'Architecture', kind: 'markdown', body: '' },
        },
      ],
    };
    const control = new MemorySpaceBackendTestControl();
    control.queueResult({ kind: 'permanent-failure', code: 'forbidden', message: 'denied' });
    const backend = new MemorySpaceBackend(
      META_ID,
      [
        { snapshot: metaSnapshot, revision: 3n, exportedRevision: null },
        { snapshot: diagramlessTarget, revision: 7n, exportedRevision: null },
      ],
      control,
    );
    const registry = createSpaceSessionRegistry(backend);
    const meta = registry.open({ snapshot: metaSnapshot, revision: 3n, exportedRevision: null });
    const before = structuredClone(meta.getState());
    const lifecycle = registry.spaceThings(idSource([TARGET_DIAGRAM_ID, TARGET_GRAPH_ID]));

    await expect(
      lifecycle.link({
        containingSpaceId: META_ID,
        diagramId: META_DIAGRAM_ID,
        targetSpaceId: TARGET_ID,
        title: 'Architecture',
        position: { x: 240, y: 80 },
      }),
    ).resolves.toEqual({
      kind: 'refused',
      refusal: {
        code: 'space-thing-target-unavailable',
        spaceId: TARGET_ID,
        reason: 'not-initialized',
      },
    });

    // The two identities the attempt drew are spent and the target is untouched,
    // but no Thing names either: initialization running before the Edit is what
    // makes a failure here produce nothing rather than half of something.
    expect(meta.getState()).toEqual(before);
    expect(await backend.loadSpace(META_ID)).toEqual({
      snapshot: metaSnapshot,
      revision: 3n,
      exportedRevision: null,
    });
    expect(await backend.loadSpace(TARGET_ID)).toEqual({
      snapshot: diagramlessTarget,
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
   * that lands after it keeps the Diagram and Graph it minted while making no
   * Thing. That is accepted: ADR 0079 already has a Space gain its Diagram the
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
    const diagramlessTargetNamingMeta: SpaceSnapshot = {
      id: TARGET_ID,
      document: { version: 1, title: 'Architecture' },
      things: [
        {
          id: TARGET_THING_ID,
          document: {
            title: 'Back to Meta',
            kind: 'space',
            spaceId: META_ID,
            diagram: META_DIAGRAM_ID,
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
        { snapshot: diagramlessTargetNamingMeta, revision: 7n, exportedRevision: null },
      ],
      control,
    );
    const registry = createSpaceSessionRegistry(backend);
    const meta = registry.open({ snapshot: metaSnapshot, revision: 3n, exportedRevision: null });
    const before = structuredClone(meta.getState());
    // Three for the first attempt — the Diagram, its Graph, then the Thing the
    // refusal discards — and one for the second, which draws a Thing id the way
    // every attempt does and draws no Diagram or Graph, which is the claim. A
    // fifth would mean the retry re-initialized.
    const lifecycle = registry.spaceThings(
      idSource([TARGET_DIAGRAM_ID, TARGET_GRAPH_ID, SPACE_THING_ID, SECOND_SPACE_THING_ID]),
    );
    const link = () =>
      lifecycle.link({
        containingSpaceId: META_ID,
        diagramId: META_DIAGRAM_ID,
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
            kind: 'space-thing-reference-cycle',
            spaceId: TARGET_ID,
            thingId: TARGET_THING_ID,
            targetSpaceId: META_ID,
          },
        ],
      },
    });

    // No Thing anywhere, and Meta is exactly as it was.
    expect(meta.getState()).toEqual(before);
    expect(await backend.loadSpace(META_ID)).toEqual({
      snapshot: metaSnapshot,
      revision: 3n,
      exportedRevision: null,
    });
    // The target, however, keeps what initialization gave it.
    const initialized = await backend.loadSpace(TARGET_ID);
    expect(initialized?.revision).toBe(8n);
    expect(initialized?.snapshot.document.defaultDiagram).toBe(TARGET_DIAGRAM_ID);
    expect(control.requests).toHaveLength(1);

    // Idempotent: the retry reads a target that is already initialized, so it
    // mints no second Diagram or Graph and issues no second commit, and is
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
    const lifecycle = registry.spaceThings(idSource([]));

    // The same refusal a failed initialization answers, and for the same reason:
    // the author's move is to choose another Space, and this Edit did not begin.
    // A target that has gone is an ordinary answer rather than a throw, because
    // nothing holds the listing and the Edit together.
    await expect(
      lifecycle.link({
        containingSpaceId: META_ID,
        diagramId: META_DIAGRAM_ID,
        targetSpaceId: TARGET_ID,
        title: 'Architecture',
        position: { x: 240, y: 80 },
      }),
    ).resolves.toEqual({
      kind: 'refused',
      refusal: { code: 'space-thing-target-unavailable', spaceId: TARGET_ID, reason: 'missing' },
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
        defaultDiagram: TARGET_DIAGRAM_ID,
        diagrams: [
          {
            id: TARGET_DIAGRAM_ID,
            title: 'Diagram 1',
            kind: 'positioned',
            positions: { [TARGET_THING_ID]: { x: 0, y: 0, open: false } },
            // Names a Thing this Space does not hold, which is what single-Space
            // intake refuses and what no repair here would mend.
            graphs: [
              {
                id: TARGET_GRAPH_ID,
                title: 'Graph 1',
                edges: [{ from: TARGET_THING_ID, to: SECOND_SPACE_THING_ID }],
              },
            ],
            activeGraph: TARGET_GRAPH_ID,
          },
        ],
      },
      things: [
        { id: TARGET_THING_ID, document: { title: 'Architecture', kind: 'markdown', body: '' } },
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
    const lifecycle = registry.spaceThings(idSource([]));

    await expect(
      lifecycle.link({
        containingSpaceId: META_ID,
        diagramId: META_DIAGRAM_ID,
        targetSpaceId: TARGET_ID,
        title: 'Architecture',
        position: { x: 240, y: 80 },
      }),
    ).resolves.toEqual({
      kind: 'refused',
      refusal: {
        code: 'space-thing-target-unavailable',
        spaceId: TARGET_ID,
        reason: 'unreadable',
      },
    });

    // The empty id source is the second claim: an unreadable target is refused
    // without minting the Diagram and Graph an initializable one would have.
    expect(meta.getState().working).toEqual(metaSnapshot);
    expect(control.requests).toHaveLength(0);
  });

  it('keeps a target referenced by an uncommitted sibling session', async () => {
    const linkedMeta: SpaceSnapshot = {
      ...metaSnapshot,
      things: [
        ...metaSnapshot.things,
        {
          id: SPACE_THING_ID,
          document: {
            title: 'Target',
            kind: 'space',
            spaceId: TARGET_ID,
            diagram: TARGET_DIAGRAM_ID,
            graph: TARGET_GRAPH_ID,
          },
        },
        {
          id: SECOND_SPACE_THING_ID,
          document: {
            title: 'Sibling',
            kind: 'space',
            spaceId: CHILD_ID,
            diagram: CHILD_DIAGRAM_ID,
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
        defaultDiagram: CHILD_DIAGRAM_ID,
        diagrams: [
          {
            id: CHILD_DIAGRAM_ID,
            title: 'Diagram 1',
            kind: 'positioned',
            positions: { [CHILD_THING_ID]: { x: 0, y: 0, open: false } },
            graphs: [{ id: CHILD_GRAPH_ID, title: 'Graph 1', edges: [] }],
            activeGraph: CHILD_GRAPH_ID,
          },
        ],
      },
      things: [
        {
          id: CHILD_THING_ID,
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
    registry.open({ snapshot: linkedMeta, revision: 3n, exportedRevision: null });
    const siblingSession = registry.open({
      snapshot: sibling,
      revision: 2n,
      exportedRevision: null,
    });
    control.queueResult({ kind: 'retryable-failure', code: 'network', message: 'offline' });
    siblingSession.submit({
      ...sibling,
      things: [
        ...sibling.things,
        {
          id: CHILD_LINK_ID,
          document: {
            title: 'Target',
            kind: 'space',
            spaceId: TARGET_ID,
            diagram: TARGET_DIAGRAM_ID,
            graph: TARGET_GRAPH_ID,
          },
        },
      ],
    });
    await vi.waitFor(() => expect(siblingSession.getState().persistence.kind).toBe('failed'));
    const lifecycle = registry.spaceThings(idSource([]));

    await expect(
      lifecycle.delete({ containingSpaceId: META_ID, thingId: SPACE_THING_ID }),
    ).resolves.toEqual({ kind: 'completed' });

    expect(await backend.loadSpace(TARGET_ID)).toMatchObject({ revision: 7n });
    expect(registry.session(TARGET_ID)).toBeUndefined();
  });

  it.each(['link', 'create'] as const)(
    'refuses %s when its containing Diagram is absent',
    async (operation) => {
      const backend = new MemorySpaceBackend(META_ID, [
        { snapshot: metaSnapshot, revision: 3n, exportedRevision: null },
        { snapshot: targetSnapshot, revision: 7n, exportedRevision: null },
      ]);
      const registry = createSpaceSessionRegistry(backend);
      registry.open({ snapshot: metaSnapshot, revision: 3n, exportedRevision: null });
      const lifecycle = registry.spaceThings(idSource([]));

      const result =
        operation === 'link'
          ? await lifecycle.link({
              containingSpaceId: META_ID,
              diagramId: TARGET_DIAGRAM_ID,
              targetSpaceId: TARGET_ID,
              title: 'Missing diagram',
              position: { x: 240, y: 80 },
            })
          : await lifecycle.create({
              containingSpaceId: META_ID,
              diagramId: TARGET_DIAGRAM_ID,
              title: 'Missing diagram',
              position: { x: 240, y: 80 },
            });

      expect(result).toEqual({
        kind: 'refused',
        refusal: { code: 'diagram-not-found', diagramId: TARGET_DIAGRAM_ID },
      });
    },
  );

  it('refuses deletion when the selected Thing is not a Space Thing', async () => {
    const backend = new MemorySpaceBackend(META_ID, [
      { snapshot: metaSnapshot, revision: 3n, exportedRevision: null },
    ]);
    const registry = createSpaceSessionRegistry(backend);
    registry.open({ snapshot: metaSnapshot, revision: 3n, exportedRevision: null });
    const lifecycle = registry.spaceThings(idSource([]));

    await expect(
      lifecycle.delete({ containingSpaceId: META_ID, thingId: META_THING_ID }),
    ).resolves.toEqual({
      kind: 'refused',
      refusal: { code: 'space-thing-not-found', thingId: META_THING_ID },
    });
  });
});
