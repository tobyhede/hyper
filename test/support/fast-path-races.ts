import { uuidSchema, type SpaceSnapshot, type UUID } from '@project/core';
import { describe, expect, it } from 'vitest';
import { SqlSpaceRepository } from '../../src/persistence/sql-space-repository';
import type { SqlStore } from '../../src/persistence/sql-store';

/*
 * Races between the commit fast path and the operations that hold the
 * aggregate lock exclusively, run against each database `SqlSpaceRepository`
 * serves: `test/integration/fast-path-races.test.ts` (PostgreSQL) and
 * `test/integration/sqlite-fast-path-races.test.ts` (SQLite).
 *
 * Each race pauses one side inside its transaction at a chosen point, starts
 * the other, checks the other is still waiting after a delay, then releases
 * the first. Every outcome must be the outcome of running the two one after
 * the other in the order they reached the database. On SQLite the second
 * operation waits in the store's per-handle queue; on PostgreSQL it waits on
 * the aggregate lock, which the fast path holds in shared mode.
 */

type Pausable = 'loadWithResources' | 'loadEvery' | 'deleteExcept';

interface Pause {
  /** Settles when the paused call has returned and the transaction is held. */
  readonly reached: Promise<undefined>;
  readonly release: () => void;
}

/**
 * A database's own `SqlStore`, recording which mode of the aggregate lock each
 * transaction takes, and able to hold the next call to one member -- after
 * that call has run -- until released.
 */
export const instrumentStore = <Handle, Order>(store: SqlStore<Handle, Order>) => {
  let locks: ('exclusive' | 'shared')[] = [];
  const armed = new Map<
    Pausable,
    {
      readonly reached: PromiseWithResolvers<undefined>;
      readonly release: PromiseWithResolvers<undefined>;
    }
  >();
  const holdAfter = async <Result>(member: Pausable, result: Result): Promise<Result> => {
    const pause = armed.get(member);
    if (pause === undefined) return result;
    armed.delete(member);
    pause.reached.resolve(undefined);
    await pause.release.promise;
    return result;
  };
  const instrumented: SqlStore<Handle, Order> = {
    ...store,
    lockAggregate: (handle) => {
      locks.push('exclusive');
      return store.lockAggregate(handle);
    },
    lockAggregateShared: (handle) => {
      locks.push('shared');
      return store.lockAggregateShared(handle);
    },
    tables: (handle) => {
      const tables = store.tables(handle);
      return {
        ...tables,
        Space: {
          ...tables.Space,
          loadWithResources: async (id) =>
            holdAfter('loadWithResources', await tables.Space.loadWithResources(id)),
          loadEvery: async () => holdAfter('loadEvery', await tables.Space.loadEvery()),
        },
        Resource: {
          ...tables.Resource,
          deleteExcept: async (spaceId, keepIds) => {
            await tables.Resource.deleteExcept(spaceId, keepIds);
            await holdAfter('deleteExcept', undefined);
          },
        },
      };
    },
  };
  return {
    store: instrumented,
    /** Hold the next call to `member`, after it has run, until `release`. */
    pauseAfter: (member: Pausable): Pause => {
      const pause = {
        reached: Promise.withResolvers<undefined>(),
        release: Promise.withResolvers<undefined>(),
      };
      armed.set(member, pause);
      return { reached: pause.reached.promise, release: () => pause.release.resolve(undefined) };
    },
    /** Every aggregate lock taken since the last call, in order, and forget them. */
    takeLocks: (): readonly ('exclusive' | 'shared')[] => {
      const taken = locks;
      locks = [];
      return taken;
    },
  };
};

const idAt = (offset: number): UUID =>
  uuidSchema.parse(`21e00000-0000-4000-8000-${offset.toString(16).padStart(12, '0')}`);

const META = idAt(1);
const A = idAt(2);
const B = idAt(3);
const META_MAP = idAt(10);
const META_GRAPH = idAt(11);
const A_MAP = idAt(20);
const A_GRAPH = idAt(21);
const A_SECOND_GRAPH = idAt(22);
const REPLACED_A_MAP = idAt(23);
const REPLACED_A_GRAPH = idAt(24);
const B_MAP = idAt(30);
const B_GRAPH = idAt(31);
const LINK_TO_A = idAt(40);
const LINK_TO_B = idAt(41);
const A_FIRST = idAt(50);
const A_SECOND = idAt(51);
const B_FIRST = idAt(60);

const markdown = (id: UUID, title: string) => ({
  id,
  document: { title, kind: 'markdown' as const, body: title },
});

const link = (id: UUID, spaceId: UUID, map: UUID, graph: UUID) => ({
  id,
  document: { title: 'Link', kind: 'space' as const, spaceId, map, graph },
});

const meta = (links: readonly ReturnType<typeof link>[]): SpaceSnapshot => ({
  id: META,
  document: {
    version: 1,
    title: 'Meta',
    defaultMap: META_MAP,
    maps: [
      {
        id: META_MAP,
        title: 'Map',
        kind: 'positioned',
        positions: {},
        graphs: [{ id: META_GRAPH, title: 'Graph', edges: [] }],
      },
    ],
  },
  resources: [...links],
});

/** Space A, whose first Graph Meta's Space Resource selects. */
const spaceA = (
  secondX: number,
  ids: { readonly map: UUID; readonly graph: UUID } = { map: A_MAP, graph: A_GRAPH },
): SpaceSnapshot => ({
  id: A,
  document: {
    version: 1,
    title: 'A',
    defaultMap: ids.map,
    maps: [
      {
        id: ids.map,
        title: 'Map',
        kind: 'positioned',
        positions: {
          [A_FIRST]: { x: 0, y: 0, open: false },
          [A_SECOND]: { x: secondX, y: 0, open: false },
        },
        graphs: [
          { id: ids.graph, title: 'Graph', edges: [{ from: A_FIRST, to: A_SECOND }] },
          { id: A_SECOND_GRAPH, title: 'Second Graph', edges: [] },
        ],
        activeGraph: ids.graph,
      },
    ],
  },
  resources: [markdown(A_FIRST, 'First'), markdown(A_SECOND, 'Second')],
});

const spaceB = (x: number): SpaceSnapshot => ({
  id: B,
  document: {
    version: 1,
    title: 'B',
    defaultMap: B_MAP,
    maps: [
      {
        id: B_MAP,
        title: 'Map',
        kind: 'positioned',
        positions: { [B_FIRST]: { x, y: 0, open: false } },
        graphs: [{ id: B_GRAPH, title: 'Graph', color: 'teal', edges: [] }],
      },
    ],
  },
  resources: [markdown(B_FIRST, 'First')],
});

const linkToA = link(LINK_TO_A, A, A_MAP, A_GRAPH);
const linkToB = link(LINK_TO_B, B, B_MAP, B_GRAPH);
const seedMeta = meta([linkToA, linkToB]);
const seedA = spaceA(300);
const seedB = spaceB(0);

/** A Map-internal Edit to A: one Resource moved. */
const movedA = spaceA(640);

/** A without the Graph Meta selects, and Meta selecting A's other Graph. */
const withoutSelectedGraph: SpaceSnapshot = {
  ...seedA,
  document: {
    ...seedA.document,
    maps: (seedA.document.maps ?? []).map((map) => ({
      ...map,
      graphs: map.graphs.filter((graph) => graph.id !== A_GRAPH),
      activeGraph: A_SECOND_GRAPH,
    })),
  },
};
const metaSelectingSecondGraph = meta([link(LINK_TO_A, A, A_MAP, A_SECOND_GRAPH), linkToB]);

/** A recreated with new Map and Graph ids, and Meta selecting them. */
const replacedA = spaceA(300, { map: REPLACED_A_MAP, graph: REPLACED_A_GRAPH });
const replacedMeta = meta([link(LINK_TO_A, A, REPLACED_A_MAP, REPLACED_A_GRAPH), linkToB]);

const update = (snapshot: SpaceSnapshot, expectedRevision: bigint) => ({
  kind: 'update' as const,
  spaceId: snapshot.id,
  snapshot,
  expectedRevision,
});

const stored = (snapshot: SpaceSnapshot, revision: bigint) => ({
  snapshot,
  revision,
  exportedRevision: null,
});

/** Long enough for a commit that is not waiting to have answered. */
const stillWaiting = async (operation: Promise<unknown>): Promise<boolean> => {
  let settled = false;
  void operation.then(
    () => (settled = true),
    () => (settled = true),
  );
  await new Promise((resolve) => setTimeout(resolve, 500));
  return !settled;
};

export interface RaceTarget<Handle, Order> {
  /** The database's own store, over content already cleared. */
  readonly store: SqlStore<Handle, Order>;
  /**
   * Whether two commits on one store can run at once. False where the store
   * queues every operation, so a paused commit holds up every other.
   */
  readonly runsCommitsConcurrently: boolean;
  readonly close: () => Promise<void>;
}

export const fastPathRaces = <Handle, Order>(
  name: string,
  open: () => Promise<RaceTarget<Handle, Order>>,
) =>
  describe(name, () => {
    const withTarget = async (
      run: (context: {
        readonly paused: SqlSpaceRepository<Handle, Order>;
        readonly plain: SqlSpaceRepository<Handle, Order>;
        readonly instrumented: ReturnType<typeof instrumentStore<Handle, Order>>;
        readonly runsCommitsConcurrently: boolean;
      }) => Promise<void>,
    ) => {
      const target = await open();
      try {
        const instrumented = instrumentStore(target.store);
        const plain = new SqlSpaceRepository(target.store);
        const seeded = await plain.initializeAggregate({
          metaSpaceId: META,
          spaces: [seedMeta, seedA, seedB],
        });
        expect(seeded.kind).toBe('initialized');
        await run({
          paused: new SqlSpaceRepository(instrumented.store),
          plain,
          instrumented,
          runsCommitsConcurrently: target.runsCommitsConcurrently,
        });
      } finally {
        await target.close();
      }
    };

    it('commits a Map-internal Edit under the shared aggregate lock only', async () => {
      await withTarget(async ({ paused, instrumented }) => {
        instrumented.takeLocks();
        await expect(paused.commit({ changes: [update(movedA, 0n)] })).resolves.toMatchObject({
          kind: 'committed',
        });
        expect(instrumented.takeLocks()).toEqual(['shared']);

        // A Graph deletion changes what Meta's Space Resource can select, so
        // the fast path hands it to the complete-aggregate decision.
        await expect(
          paused.commit({ changes: [update(withoutSelectedGraph, 1n)] }),
        ).resolves.toMatchObject({ kind: 'aggregate-refused' });
        expect(instrumented.takeLocks()).toEqual(['shared', 'exclusive']);
      });
    });

    it('serialises a Map-internal Edit that read first before a Graph deletion that reads after', async () => {
      await withTarget(async ({ paused, plain, instrumented }) => {
        const pause = instrumented.pauseAfter('loadWithResources');
        const moving = paused.commit({ changes: [update(movedA, 0n)] });
        await pause.reached;
        const deleting = plain.commit({
          changes: [update(withoutSelectedGraph, 0n), update(metaSelectingSecondGraph, 0n)],
        });
        try {
          expect(await stillWaiting(deleting)).toBe(true);
        } finally {
          pause.release();
        }

        await expect(moving).resolves.toMatchObject({ kind: 'committed' });
        await expect(deleting).resolves.toMatchObject({
          kind: 'conflict',
          conflicts: [{ spaceId: A, current: stored(movedA, 1n) }],
        });
        await expect(plain.loadAggregate()).resolves.toEqual({
          kind: 'loaded',
          aggregate: {
            metaSpaceId: META,
            spaces: [stored(seedMeta, 0n), stored(movedA, 1n), stored(seedB, 0n)],
          },
        });
      });
    });

    it('serialises a Graph deletion that read first before a Map-internal Edit that reads after', async () => {
      await withTarget(async ({ paused, plain, instrumented }) => {
        const pause = instrumented.pauseAfter('loadEvery');
        const deleting = paused.commit({
          changes: [update(withoutSelectedGraph, 0n), update(metaSelectingSecondGraph, 0n)],
        });
        await pause.reached;
        const moving = plain.commit({ changes: [update(movedA, 0n)] });
        try {
          expect(await stillWaiting(moving)).toBe(true);
        } finally {
          pause.release();
        }

        await expect(deleting).resolves.toMatchObject({ kind: 'committed' });
        await expect(moving).resolves.toMatchObject({
          kind: 'conflict',
          conflicts: [{ spaceId: A, current: stored(withoutSelectedGraph, 1n) }],
        });
        await expect(plain.loadAggregate()).resolves.toEqual({
          kind: 'loaded',
          aggregate: {
            metaSpaceId: META,
            spaces: [
              stored(metaSelectingSecondGraph, 1n),
              stored(withoutSelectedGraph, 1n),
              stored(seedB, 0n),
            ],
          },
        });
      });
    });

    it('keeps a replacement that recreates a Space at revision 0 from landing between a fast-path read and its write', async () => {
      await withTarget(async ({ paused, plain, instrumented }) => {
        const pause = instrumented.pauseAfter('loadWithResources');
        const moving = paused.commit({ changes: [update(movedA, 0n)] });
        await pause.reached;
        const replacing = plain.replaceAggregate(
          { metaSpaceId: META, spaces: [replacedMeta, replacedA, seedB] },
          META,
        );
        try {
          expect(await stillWaiting(replacing)).toBe(true);
        } finally {
          pause.release();
        }

        // The Edit, then the replacement over it. Had the replacement landed
        // inside the pause, the Edit would have written A's old Map and Graph
        // ids over the recreated A, leaving Meta's Space Resource dangling.
        await expect(moving).resolves.toMatchObject({ kind: 'committed' });
        await expect(replacing).resolves.toMatchObject({ kind: 'replaced' });
        await expect(plain.loadAggregate()).resolves.toEqual({
          kind: 'loaded',
          aggregate: {
            metaSpaceId: META,
            spaces: [stored(replacedMeta, 0n), stored(replacedA, 0n), stored(seedB, 0n)],
          },
        });
      });
    });

    it('keeps a Space deletion from passing at a revision a written but uncommitted fast path has moved', async () => {
      await withTarget(async ({ paused, plain, instrumented }) => {
        // Held after every write of the fast path, before it commits.
        const pause = instrumented.pauseAfter('deleteExcept');
        const moving = paused.commit({ changes: [update(movedA, 0n)] });
        await pause.reached;
        const deleting = plain.commit({
          changes: [
            { kind: 'delete', spaceId: A, expectedRevision: 0n },
            update(meta([linkToB]), 0n),
          ],
        });
        try {
          expect(await stillWaiting(deleting)).toBe(true);
        } finally {
          pause.release();
        }

        await expect(moving).resolves.toMatchObject({ kind: 'committed' });
        await expect(deleting).resolves.toMatchObject({
          kind: 'conflict',
          conflicts: [{ spaceId: A, current: stored(movedA, 1n) }],
        });
        await expect(plain.loadAggregate()).resolves.toEqual({
          kind: 'loaded',
          aggregate: {
            metaSpaceId: META,
            spaces: [stored(seedMeta, 0n), stored(movedA, 1n), stored(seedB, 0n)],
          },
        });
      });
    });

    it('lets Map-internal Edits to different Spaces commit side by side where the store runs commits concurrently', async () => {
      await withTarget(async ({ paused, plain, instrumented, runsCommitsConcurrently }) => {
        const pause = instrumented.pauseAfter('loadWithResources');
        const movingA = paused.commit({ changes: [update(movedA, 0n)] });
        await pause.reached;
        const movingB = plain.commit({ changes: [update(spaceB(480), 0n)] });
        try {
          // Where commits run concurrently B has to commit while A is held, so
          // it is awaited rather than timed: a B that waits for A never settles
          // here, and the test times out instead of racing a fixed delay.
          if (runsCommitsConcurrently) {
            await expect(movingB).resolves.toMatchObject({ kind: 'committed' });
          } else {
            expect(await stillWaiting(movingB)).toBe(true);
          }
        } finally {
          pause.release();
        }

        await expect(movingA).resolves.toMatchObject({ kind: 'committed' });
        await expect(movingB).resolves.toMatchObject({ kind: 'committed' });
        await expect(plain.loadAggregate()).resolves.toEqual({
          kind: 'loaded',
          aggregate: {
            metaSpaceId: META,
            spaces: [stored(seedMeta, 0n), stored(movedA, 1n), stored(spaceB(480), 1n)],
          },
        });
      });
    });
  });
