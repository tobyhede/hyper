import { describe, expect, it, vi } from 'vitest';
import { uuidSchema, type SpaceSnapshot, type UUID } from '@project/core';
import { MemorySpaceBackend, MemorySpaceBackendTestControl } from '../src/memory';
import { createSpaceSessionRegistry } from '../src/session-registry';

const META_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const META_CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const META_LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const META_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const TARGET_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000010');
const TARGET_CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000011');
const TARGET_LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000012');
const TARGET_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000013');
const SPACE_CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000014');
const SECOND_SPACE_CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000015');
const CHILD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000016');
const CHILD_CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000017');
const CHILD_LINK_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000018');

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
    defaultLayout: META_LAYOUT_ID,
    layouts: [
      {
        id: META_LAYOUT_ID,
        title: 'Layout 1',
        kind: 'positioned',
        positions: { [META_CARD_ID]: { x: 0, y: 0, open: false } },
        graphs: [{ id: META_GRAPH_ID, title: 'Graph 1', edges: [] }],
        activeGraph: META_GRAPH_ID,
      },
    ],
  },
  cards: [
    {
      id: META_CARD_ID,
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
    defaultLayout: TARGET_LAYOUT_ID,
    layouts: [
      {
        id: TARGET_LAYOUT_ID,
        title: 'Layout 1',
        kind: 'positioned',
        positions: { [TARGET_CARD_ID]: { x: 0, y: 0, open: false } },
        graphs: [{ id: TARGET_GRAPH_ID, title: 'Graph 1', edges: [] }],
        activeGraph: TARGET_GRAPH_ID,
      },
    ],
  },
  cards: [
    {
      id: TARGET_CARD_ID,
      document: { title: 'Architecture', kind: 'markdown', body: '' },
    },
  ],
};

describe('Space Card lifecycle', () => {
  it.each(['create', 'link'] as const)(
    'reports a thrown coordination read asynchronously for %s and releases the barrier',
    async (operation) => {
      const sourceSnapshot: SpaceSnapshot =
        operation === 'link'
          ? {
              ...metaSnapshot,
              cards: [
                ...metaSnapshot.cards,
                {
                  id: SECOND_SPACE_CARD_ID,
                  document: { title: 'Existing target', kind: 'space', spaceId: TARGET_ID },
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
      const lifecycle = registry.spaceCards(
        idSource(
          operation === 'create'
            ? [TARGET_ID, TARGET_CARD_ID, TARGET_LAYOUT_ID, TARGET_GRAPH_ID, SPACE_CARD_ID]
            : [SPACE_CARD_ID],
        ),
      );

      const result =
        operation === 'create'
          ? await lifecycle.create({
              containingSpaceId: META_ID,
              layoutId: META_LAYOUT_ID,
              title: 'Architecture',
              position: { x: 240, y: 80 },
            })
          : await lifecycle.link({
              containingSpaceId: META_ID,
              layoutId: META_LAYOUT_ID,
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
            cards: sourceSnapshot.cards,
          },
        },
      ]);
    },
  );

  it('reports a thrown delete-derivation read asynchronously and releases the barrier', async () => {
    const linkedMeta: SpaceSnapshot = {
      ...metaSnapshot,
      cards: [
        ...metaSnapshot.cards,
        { id: SPACE_CARD_ID, document: { title: 'Target', kind: 'space', spaceId: TARGET_ID } },
      ],
      document: {
        ...metaSnapshot.document,
        layouts: metaSnapshot.document.layouts?.map((layout) => ({
          ...layout,
          positions: {
            ...layout.positions,
            [SPACE_CARD_ID]: { x: 240, y: 80, open: false },
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
    const lifecycle = registry.spaceCards(idSource([]));

    await expect(
      lifecycle.delete({ containingSpaceId: META_ID, cardId: SPACE_CARD_ID }),
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
          cards: linkedMeta.cards,
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
    const lifecycle = registry.spaceCards(idSource([SPACE_CARD_ID, SECOND_SPACE_CARD_ID]));

    await lifecycle.link({
      containingSpaceId: META_ID,
      layoutId: META_LAYOUT_ID,
      targetSpaceId: TARGET_ID,
      title: 'First',
      position: { x: 240, y: 80 },
    });
    const second = lifecycle.link({
      containingSpaceId: META_ID,
      layoutId: META_LAYOUT_ID,
      targetSpaceId: TARGET_ID,
      title: 'Second',
      position: { x: 480, y: 80 },
    });

    expect(meta.getState().working.cards).toHaveLength(2);
    expect(control.requests).toHaveLength(1);
    release();
    await second;
    expect(meta.getState().working.cards).toHaveLength(3);
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
      cards: [
        ...target.getState().working.cards,
        {
          id: CHILD_LINK_ID,
          document: { title: 'Unsaved child', kind: 'space', spaceId: CHILD_ID },
        },
      ],
    });
    await vi.waitFor(() => expect(target.getState().persistence.kind).toBe('rejected'));
    const lifecycle = registry.spaceCards(idSource([SPACE_CARD_ID]));

    await expect(
      lifecycle.link({
        containingSpaceId: META_ID,
        layoutId: META_LAYOUT_ID,
        targetSpaceId: TARGET_ID,
        title: 'Link',
        position: { x: 240, y: 80 },
      }),
    ).resolves.toMatchObject({
      kind: 'refused',
      refusal: {
        code: 'aggregate-refused',
        errors: [{ kind: 'space-card-target-missing' }],
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
    const lifecycle = registry.spaceCards(idSource([SPACE_CARD_ID]));

    await lifecycle.link({
      containingSpaceId: META_ID,
      layoutId: META_LAYOUT_ID,
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
      const lifecycle = registry.spaceCards(idSource([SPACE_CARD_ID]));

      await expect(
        lifecycle.link({
          containingSpaceId: META_ID,
          layoutId: META_LAYOUT_ID,
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
      cards: [
        ...metaSnapshot.cards,
        { id: SPACE_CARD_ID, document: { title: 'Target', kind: 'space', spaceId: TARGET_ID } },
      ],
      document: {
        ...metaSnapshot.document,
        layouts: metaSnapshot.document.layouts?.map((layout) => ({
          ...layout,
          positions: {
            ...layout.positions,
            [SPACE_CARD_ID]: { x: 240, y: 80, open: false },
          },
        })),
      },
    };
    const control = new MemorySpaceBackendTestControl();
    // The conflict names the cascade's target only. Meta is a participant
    // because the same edit removes its Space Card, but the repository never
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
    const lifecycle = registry.spaceCards(idSource([]));

    await lifecycle.delete({ containingSpaceId: META_ID, cardId: SPACE_CARD_ID });
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
      cards: [
        ...metaSnapshot.cards,
        { id: SPACE_CARD_ID, document: { title: 'Target', kind: 'space', spaceId: TARGET_ID } },
      ],
      document: {
        ...metaSnapshot.document,
        layouts: metaSnapshot.document.layouts?.map((layout) => ({
          ...layout,
          positions: {
            ...layout.positions,
            [SPACE_CARD_ID]: { x: 240, y: 80, open: false },
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
    const lifecycle = registry.spaceCards(idSource([]));

    await expect(
      lifecycle.delete({ containingSpaceId: META_ID, cardId: SPACE_CARD_ID }),
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
    const lifecycle = registry.spaceCards(
      idSource([TARGET_ID, TARGET_CARD_ID, TARGET_LAYOUT_ID, TARGET_GRAPH_ID, SPACE_CARD_ID]),
    );

    await lifecycle.create({
      containingSpaceId: META_ID,
      layoutId: META_LAYOUT_ID,
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
    const lifecycle = registry.spaceCards(
      idSource([TARGET_ID, TARGET_CARD_ID, TARGET_LAYOUT_ID, TARGET_GRAPH_ID, SPACE_CARD_ID]),
    );

    await lifecycle.create({
      containingSpaceId: META_ID,
      layoutId: META_LAYOUT_ID,
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
    const lifecycle = registry.spaceCards(
      idSource([TARGET_ID, TARGET_CARD_ID, TARGET_LAYOUT_ID, TARGET_GRAPH_ID, SPACE_CARD_ID]),
    );

    await lifecycle.create({
      containingSpaceId: META_ID,
      layoutId: META_LAYOUT_ID,
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
    const lifecycle = registry.spaceCards(
      idSource([TARGET_ID, TARGET_CARD_ID, TARGET_LAYOUT_ID, TARGET_GRAPH_ID, SPACE_CARD_ID]),
    );
    await lifecycle.create({
      containingSpaceId: META_ID,
      layoutId: META_LAYOUT_ID,
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
    const lifecycle = registry.spaceCards(
      idSource([TARGET_ID, TARGET_CARD_ID, TARGET_LAYOUT_ID, TARGET_GRAPH_ID, SPACE_CARD_ID]),
    );
    await lifecycle.create({
      containingSpaceId: META_ID,
      layoutId: META_LAYOUT_ID,
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
    const lifecycle = registry.spaceCards(idSource([SPACE_CARD_ID]));
    await lifecycle.link({
      containingSpaceId: META_ID,
      layoutId: META_LAYOUT_ID,
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
    const lifecycle = registry.spaceCards(idSource([SPACE_CARD_ID]));
    await lifecycle.link({
      containingSpaceId: META_ID,
      layoutId: META_LAYOUT_ID,
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
    const lifecycle = registry.spaceCards(
      idSource([TARGET_ID, TARGET_CARD_ID, TARGET_LAYOUT_ID, TARGET_GRAPH_ID, SPACE_CARD_ID]),
    );

    await lifecycle.create({
      containingSpaceId: META_ID,
      layoutId: META_LAYOUT_ID,
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
    const lifecycle = registry.spaceCards(
      idSource([TARGET_ID, TARGET_CARD_ID, TARGET_LAYOUT_ID, TARGET_GRAPH_ID, SPACE_CARD_ID]),
    );
    await lifecycle.create({
      containingSpaceId: META_ID,
      layoutId: META_LAYOUT_ID,
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

  it('atomically creates the first Space Card and its normal target Space', async () => {
    const backend = new MemorySpaceBackend(META_ID, [
      { snapshot: metaSnapshot, revision: 3n, exportedRevision: null },
    ]);
    const registry = createSpaceSessionRegistry(backend);
    registry.open({ snapshot: metaSnapshot, revision: 3n, exportedRevision: null });
    const lifecycle = registry.spaceCards(
      idSource([TARGET_ID, TARGET_CARD_ID, TARGET_LAYOUT_ID, TARGET_GRAPH_ID, SPACE_CARD_ID]),
    );

    await expect(
      lifecycle.create({
        containingSpaceId: META_ID,
        layoutId: META_LAYOUT_ID,
        title: 'Architecture',
        position: { x: 240, y: 80 },
      }),
    ).resolves.toEqual({ kind: 'completed' });

    const result = await backend.loadAggregate();
    if (result.kind === 'uninitialized') throw new Error('Test backend is uninitialized');
    const aggregate = result.aggregate;
    expect(aggregate.spaces).toHaveLength(2);
    const storedMeta = await backend.loadSpace(META_ID);
    expect(storedMeta?.revision).toBe(4n);
    expect(storedMeta?.snapshot.cards).toContainEqual({
      id: SPACE_CARD_ID,
      document: { title: 'Architecture', kind: 'space', spaceId: TARGET_ID },
    });
    expect(storedMeta?.snapshot.document.layouts?.[0]?.positions[SPACE_CARD_ID]).toEqual({
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
          defaultLayout: TARGET_LAYOUT_ID,
          layouts: [
            {
              id: TARGET_LAYOUT_ID,
              title: 'Layout 1',
              kind: 'positioned',
              positions: { [TARGET_CARD_ID]: { x: 0, y: 0, open: false } },
              graphs: [{ id: TARGET_GRAPH_ID, title: 'Graph 1', edges: [] }],
              activeGraph: TARGET_GRAPH_ID,
            },
          ],
        },
        cards: [
          {
            // The typed title names the *Space*. Its first Card takes the same
            // neutral `Card 1` every new Space's first Card takes, because the
            // two are independent from the moment they exist (ADR 0068).
            id: TARGET_CARD_ID,
            document: { title: 'Card 1', kind: 'markdown', body: '' },
          },
        ],
      },
    });
  });

  it('links an existing Space and deletes its target only after the last reference is removed', async () => {
    const linkedMeta: SpaceSnapshot = {
      ...metaSnapshot,
      cards: [
        ...metaSnapshot.cards,
        {
          id: SPACE_CARD_ID,
          document: { title: 'First link', kind: 'space', spaceId: TARGET_ID },
        },
      ],
      document: {
        ...metaSnapshot.document,
        layouts: metaSnapshot.document.layouts?.map((layout) => ({
          ...layout,
          positions: {
            ...layout.positions,
            [SPACE_CARD_ID]: { x: 240, y: 80, open: false },
          },
        })),
      },
    };
    const targetWithChild: SpaceSnapshot = {
      ...targetSnapshot,
      cards: [
        ...targetSnapshot.cards,
        {
          id: CHILD_LINK_ID,
          document: { title: 'Child', kind: 'space', spaceId: CHILD_ID },
        },
      ],
    };
    const child: SpaceSnapshot = {
      id: CHILD_ID,
      document: { version: 1, title: 'Child' },
      cards: [
        {
          id: CHILD_CARD_ID,
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
    const lifecycle = registry.spaceCards(idSource([SECOND_SPACE_CARD_ID]));

    await expect(
      lifecycle.link({
        containingSpaceId: META_ID,
        layoutId: META_LAYOUT_ID,
        targetSpaceId: TARGET_ID,
        title: 'Second link',
        position: { x: 480, y: 80 },
      }),
    ).resolves.toEqual({ kind: 'completed' });

    await expect(
      lifecycle.delete({ containingSpaceId: META_ID, cardId: SPACE_CARD_ID }),
    ).resolves.toEqual({ kind: 'completed' });
    expect(await backend.loadSpace(TARGET_ID)).toMatchObject({ revision: 7n });

    await expect(
      lifecycle.delete({ containingSpaceId: META_ID, cardId: SECOND_SPACE_CARD_ID }),
    ).resolves.toEqual({ kind: 'completed' });
    expect(await backend.loadSpace(TARGET_ID)).toBeUndefined();
    expect(await backend.loadSpace(CHILD_ID)).toBeUndefined();
  });

  it('keeps a target referenced by an uncommitted sibling session', async () => {
    const linkedMeta: SpaceSnapshot = {
      ...metaSnapshot,
      cards: [
        ...metaSnapshot.cards,
        {
          id: SPACE_CARD_ID,
          document: { title: 'Target', kind: 'space', spaceId: TARGET_ID },
        },
        {
          id: SECOND_SPACE_CARD_ID,
          document: { title: 'Sibling', kind: 'space', spaceId: CHILD_ID },
        },
      ],
    };
    const sibling: SpaceSnapshot = {
      id: CHILD_ID,
      document: { version: 1, title: 'Sibling' },
      cards: [
        {
          id: CHILD_CARD_ID,
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
      cards: [
        ...sibling.cards,
        {
          id: CHILD_LINK_ID,
          document: { title: 'Target', kind: 'space', spaceId: TARGET_ID },
        },
      ],
    });
    await vi.waitFor(() => expect(siblingSession.getState().persistence.kind).toBe('failed'));
    const lifecycle = registry.spaceCards(idSource([]));

    await expect(
      lifecycle.delete({ containingSpaceId: META_ID, cardId: SPACE_CARD_ID }),
    ).resolves.toEqual({ kind: 'completed' });

    expect(await backend.loadSpace(TARGET_ID)).toMatchObject({ revision: 7n });
    expect(registry.session(TARGET_ID)).toBeUndefined();
  });

  it.each(['link', 'create'] as const)(
    'refuses %s when its containing Layout is absent',
    async (operation) => {
      const backend = new MemorySpaceBackend(META_ID, [
        { snapshot: metaSnapshot, revision: 3n, exportedRevision: null },
        { snapshot: targetSnapshot, revision: 7n, exportedRevision: null },
      ]);
      const registry = createSpaceSessionRegistry(backend);
      registry.open({ snapshot: metaSnapshot, revision: 3n, exportedRevision: null });
      const lifecycle = registry.spaceCards(idSource([]));

      const result =
        operation === 'link'
          ? await lifecycle.link({
              containingSpaceId: META_ID,
              layoutId: TARGET_LAYOUT_ID,
              targetSpaceId: TARGET_ID,
              title: 'Missing layout',
              position: { x: 240, y: 80 },
            })
          : await lifecycle.create({
              containingSpaceId: META_ID,
              layoutId: TARGET_LAYOUT_ID,
              title: 'Missing layout',
              position: { x: 240, y: 80 },
            });

      expect(result).toEqual({
        kind: 'refused',
        refusal: { code: 'layout-not-found', layoutId: TARGET_LAYOUT_ID },
      });
    },
  );

  it('refuses deletion when the selected Card is not a Space Card', async () => {
    const backend = new MemorySpaceBackend(META_ID, [
      { snapshot: metaSnapshot, revision: 3n, exportedRevision: null },
    ]);
    const registry = createSpaceSessionRegistry(backend);
    registry.open({ snapshot: metaSnapshot, revision: 3n, exportedRevision: null });
    const lifecycle = registry.spaceCards(idSource([]));

    await expect(
      lifecycle.delete({ containingSpaceId: META_ID, cardId: META_CARD_ID }),
    ).resolves.toEqual({
      kind: 'refused',
      refusal: { code: 'space-card-not-found', cardId: META_CARD_ID },
    });
  });
});
