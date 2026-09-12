import { uuidSchema, type SpaceSnapshot, type UUID } from '@project/core';
import {
  AggregateInvariantError,
  createWorkingSpaceLoader,
  type LoadedSpace,
} from '@project/persistence';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { PostgresSpaceRepository } from '../../src/persistence/postgres-space-repository';
import type { SpaceRepository } from '../../src/persistence/space-repository';
import { db } from '../../src/prisma/db';
import { clearHyperContent } from '../support/clear-hyper-content';
import { spaceRepositoryContract } from '../support/repository-contract';

/**
 * Every Hyper row, gone. The same thing `--dangerous-truncate` does, and safe
 * for the same reason the replacement cases below are: `fileParallelism` is
 * off, so one integration file at a time owns the single `DATABASE_URL`.
 */
/*
 * Declared before the suite below so it runs before it, and therefore before the
 * `afterAll` that closes the connection. The harness owns a clean database at
 * both ends rather than tracking the ids it created: several of these cases are
 * about what a refused proposal leaves behind, and a per-id cleanup list would
 * be written from the same assumption the test is checking.
 */
// Deliberately unseeded: a repository has to reach a committable state from an
// empty store on its own, and every case here begins by establishing the
// contract's Meta Space through `initializeAggregate`. Seeding it by hand hid
// that the PostgreSQL adapter could not.
spaceRepositoryContract('PostgresSpaceRepository', async () => {
  await clearHyperContent();
  const repository = new PostgresSpaceRepository(db);
  const harness: SpaceRepository = {
    listSpaces: () => repository.listSpaces(),
    loadSpace: (id) => repository.loadSpace(id),
    loadAggregate: () => repository.loadAggregate(),
    initializeAggregate: (input) => repository.initializeAggregate(input),
    replaceAggregate: (input, expectedMetaSpaceId) =>
      repository.replaceAggregate(input, expectedMetaSpaceId),
    commit: (request) => repository.commit(request),
    markExported: (id, revision) => repository.markExported(id, revision),
  };
  return { repository: harness, close: clearHyperContent };
});

const SPACE_ID = uuidSchema.parse('11111111-1111-4111-8111-111111111111');
const THING_ID = uuidSchema.parse('22222222-2222-4222-8222-222222222222');
const OMITTED_THING_ID = uuidSchema.parse('33333333-3333-4333-8333-333333333333');
const MISSING_SPACE_ID = uuidSchema.parse('44444444-4444-4444-8444-444444444444');
const GRAPH_ID = uuidSchema.parse('55555555-5555-4555-8555-555555555555');
const MISSING_THING_ID = uuidSchema.parse('66666666-6666-4666-8666-666666666666');
const OTHER_SPACE_ID = uuidSchema.parse('77777777-7777-4777-8777-777777777777');
const OTHER_THING_ID = uuidSchema.parse('88888888-8888-4888-8888-888888888888');
const CONCURRENT_SPACE_ID = uuidSchema.parse('99999999-9999-4999-8999-999999999999');
const CONCURRENT_THING_ID = uuidSchema.parse('9a9a9a9a-9a9a-4a9a-8a9a-9a9a9a9a9a9a');
const MIXED_FIRST_THING_ID = uuidSchema.parse('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
const UNRESOLVED_THING_ID = uuidSchema.parse('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
const ORDERED_SPACE_ID = uuidSchema.parse('dddddddd-dddd-4ddd-8ddd-dddddddddddd');
const LINK_THING_ID = uuidSchema.parse('ffffffff-ffff-4fff-8fff-ffffffffffff');
const DIAGRAM_ID = uuidSchema.parse('0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a');
const OTHER_DIAGRAM_ID = uuidSchema.parse('0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b');
const OTHER_SPACE_DIAGRAM_ID = uuidSchema.parse('0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c');
const OTHER_SPACE_GRAPH_ID = uuidSchema.parse('0d0d0d0d-0d0d-4d0d-8d0d-0d0d0d0d0d0d');
const CONCURRENT_DIAGRAM_ID = uuidSchema.parse('0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e');
const CONCURRENT_GRAPH_ID = uuidSchema.parse('0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f');
const ORDERED_THING_IDS = [
  uuidSchema.parse('eeeeeeee-1111-4eee-8eee-eeeeeeeeeeee'),
  uuidSchema.parse('eeeeeeee-2222-4eee-8eee-eeeeeeeeeeee'),
  uuidSchema.parse('eeeeeeee-3333-4eee-8eee-eeeeeeeeeeee'),
] as const;

const snapshot: SpaceSnapshot = {
  id: SPACE_ID,
  document: {
    version: 1,
    title: 'Repository space',
  },
  things: [
    {
      id: THING_ID,
      document: {
        title: 'Stored thing',
        kind: 'markdown',
        body: 'Stored through the repository.',
      },
    },
    {
      id: OMITTED_THING_ID,
      document: {
        title: 'Thing to remove',
        kind: 'markdown',
        body: 'Runtime commits are authoritative.',
      },
    },
  ],
};

/*
 * The Space every Space Thing below points at, carrying the Diagram and Graph
 * those Things select. A Space Thing names a Diagram of its target and a Graph
 * that Diagram owns from the moment it exists (ADR 0079), so a target with no
 * Diagram is one nothing valid can reference. The Diagram positions nothing:
 * several cases here replace this Space's Things, and what a Space Thing
 * resolves is the Diagram and the Graph rather than what that Diagram places.
 */
const otherSnapshot: SpaceSnapshot = {
  id: OTHER_SPACE_ID,
  document: {
    version: 1,
    title: 'Other space',
    defaultDiagram: OTHER_SPACE_DIAGRAM_ID,
    diagrams: [
      {
        id: OTHER_SPACE_DIAGRAM_ID,
        title: 'Diagram 1',
        kind: 'positioned',
        positions: {},
        graphs: [{ id: OTHER_SPACE_GRAPH_ID, title: 'Graph 1', edges: [] }],
        activeGraph: OTHER_SPACE_GRAPH_ID,
      },
    ],
  },
  things: [
    {
      id: OTHER_THING_ID,
      document: {
        title: 'Other thing',
        kind: 'markdown',
        body: 'Owned by the other space.',
      },
    },
  ],
};

const concurrentSnapshot: SpaceSnapshot = {
  id: CONCURRENT_SPACE_ID,
  document: {
    version: 1,
    title: 'Concurrent space',
  },
  things: [
    {
      id: CONCURRENT_THING_ID,
      document: {
        title: 'Concurrent thing',
        kind: 'markdown',
        body: 'Owned by the concurrent space.',
      },
    },
  ],
};

/**
 * `snapshot` with the Space Thing that makes `otherSnapshot` part of the same
 * aggregate.
 *
 * A two-Space seed is not two Spaces side by side any more. Complete aggregate
 * intake refuses an ordinary Space nothing references
 * (`ordinary-space-unreferenced`), and both lifecycle doors ask it before they
 * write — so the pair that used to arrive through two insert-mode imports has
 * to arrive as one aggregate with Meta reaching the other Space (ADR 0078).
 *
 * It selects `otherSnapshot`'s own Diagram and Graph, which a Space Thing names
 * from the moment it exists (ADR 0079).
 */
const linkedSnapshot: SpaceSnapshot = {
  ...snapshot,
  things: [
    ...snapshot.things,
    {
      id: LINK_THING_ID,
      document: {
        title: 'Other Space',
        kind: 'space',
        spaceId: OTHER_SPACE_ID,
        diagram: OTHER_SPACE_DIAGRAM_ID,
        graph: OTHER_SPACE_GRAPH_ID,
      },
    },
  ],
};

describe('PostgresSpaceRepository', () => {
  const repository = new PostgresSpaceRepository(db);
  const createdSpaceIds = new Set<UUID>();
  const commitSpace = (next: SpaceSnapshot, expectedRevision: bigint) =>
    repository.commit({
      changes: [{ kind: 'update', spaceId: next.id, snapshot: next, expectedRevision }],
    });

  /**
   * Establish the aggregate a case starts from, and fail loudly if it did not.
   *
   * Every seed goes through `initializeAggregate`, which is one of the two
   * lifecycle doors left (ADR 0078) and the only one that establishes first
   * state. It names Meta outright, so a fixture no longer says which Space is
   * the root by putting it first.
   */
  const seed = async (metaSpaceId: UUID, spaces: readonly SpaceSnapshot[]): Promise<void> => {
    for (const space of spaces) createdSpaceIds.add(space.id);
    const result = await repository.initializeAggregate({ metaSpaceId, spaces });
    if (result.kind !== 'initialized') {
      throw new Error(`Could not seed the aggregate: ${result.kind}`);
    }
  };

  afterEach(async () => {
    await db.orm.public.RepositoryState.where({ singletonId: 1 }).delete();
    for (const id of createdSpaceIds) {
      await db.orm.public.Thing.where({ spaceId: id }).deleteAll();
      await db.orm.public.Space.where({ id }).delete();
    }
    createdSpaceIds.clear();
    await db.orm.public.Thing.where({ spaceId: SPACE_ID }).deleteAll();
    await db.orm.public.Thing.where({ spaceId: OTHER_SPACE_ID }).deleteAll();
    await db.orm.public.Thing.where({ spaceId: CONCURRENT_SPACE_ID }).deleteAll();
    await db.orm.public.Space.where({ id: SPACE_ID }).delete();
    await db.orm.public.Space.where({ id: OTHER_SPACE_ID }).delete();
    await db.orm.public.Space.where({ id: CONCURRENT_SPACE_ID }).delete();
  });

  afterAll(async () => {
    await db.close();
  });

  // A stored document that cannot be parsed at all, as opposed to a set of
  // parsed documents that together break a Meta invariant. Both are stored state
  // no aggregate can be read from, and both must reach a reader as the same
  // identifiable failure — the root address answers 500 for one and 503 for the
  // other, and start-up stops retrying on one and keeps going on the other, so a
  // corrupt document classified as a reachability problem is answered `try again
  // later` forever and retried until the budget is spent.
  //
  // Only PostgreSQL can hold this state. `MemorySpaceRepository` stores
  // snapshots that were already parsed on the way in, so it has no way to
  // present a document that fails intake on the way out.
  it('raises an identifiable invariant failure for a stored document that cannot be parsed', async () => {
    createdSpaceIds.add(SPACE_ID);
    await db.transaction(async ({ orm }) => {
      await orm.public.Space.create({
        // `title` is required by `spaceDocumentSchema`, so this row parses as
        // JSON and fails intake — corruption, a hand-edited row or a format the
        // code has since rolled forward past.
        id: SPACE_ID,
        document: { version: 1 },
        revision: 0,
      });
      await orm.public.RepositoryState.create({ singletonId: 1, metaSpaceId: SPACE_ID });
    });

    await expect(repository.loadAggregate()).rejects.toThrow(AggregateInvariantError);
  });

  it('initializes a completely identified aggregate and exposes it through load and list', async () => {
    createdSpaceIds.add(SPACE_ID);
    const initialized = await repository.initializeAggregate({
      metaSpaceId: SPACE_ID,
      spaces: [snapshot],
    });

    // The whole aggregate comes back, Meta identity included — the door
    // establishes a repository rather than inserting a Space, so what it
    // answers with is the repository's new state (ADR 0078).
    expect(initialized).toEqual({
      kind: 'initialized',
      aggregate: {
        metaSpaceId: SPACE_ID,
        spaces: [{ snapshot, revision: 0n, exportedRevision: null }],
      },
    });
    if (initialized.kind !== 'initialized') {
      throw new Error(`The aggregate was not established: ${initialized.kind}`);
    }
    await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual(initialized.aggregate.spaces[0]);
    await expect(repository.listSpaces()).resolves.toEqual([
      { id: SPACE_ID, title: 'Repository space' },
    ]);
  });

  it('classifies initialization when a concurrent winner takes a shared Thing identity', async () => {
    const winnerReady = Promise.withResolvers<undefined>();
    const releaseWinner = Promise.withResolvers<undefined>();
    const winner = db.transaction(async ({ orm }) => {
      await orm.public.Space.create({
        id: SPACE_ID,
        document: { version: 1, title: 'Winner' },
        revision: 0,
      });
      await orm.public.Thing.create({
        id: THING_ID,
        spaceId: SPACE_ID,
        document: { title: 'Shared', kind: 'markdown', body: 'Winner' },
      });
      await orm.public.RepositoryState.create({ singletonId: 1, metaSpaceId: SPACE_ID });
      winnerReady.resolve(undefined);
      await releaseWinner.promise;
    });
    await winnerReady.promise;

    const proposal: SpaceSnapshot = {
      id: CONCURRENT_SPACE_ID,
      document: { version: 1, title: 'Loser' },
      things: [
        {
          id: THING_ID,
          document: { title: 'Shared', kind: 'markdown', body: 'Loser' },
        },
      ],
    };
    const initializing = repository.initializeAggregate({
      metaSpaceId: CONCURRENT_SPACE_ID,
      spaces: [proposal],
    });
    await new Promise((resolve) => setTimeout(resolve, 500));
    releaseWinner.resolve(undefined);
    await winner;

    await expect(initializing).resolves.toMatchObject({ kind: 'already-initialized' });
  });

  it('conflicts when an authored commit wins after replacement reads its baseline', async () => {
    await repository.initializeAggregate({ metaSpaceId: SPACE_ID, spaces: [snapshot] });
    const updateApplied = Promise.withResolvers<undefined>();
    const releaseCommit = Promise.withResolvers<undefined>();
    const committing = db.transaction(async ({ orm }) => {
      await orm.public.Space.where({ id: SPACE_ID }).update({
        document: { version: 1, title: 'Authored winner' },
        revision: 1,
      });
      updateApplied.resolve(undefined);
      await releaseCommit.promise;
    });
    await updateApplied.promise;

    const replacement = repository.replaceAggregate(
      {
        metaSpaceId: SPACE_ID,
        spaces: [
          { ...snapshot, document: { ...snapshot.document, title: 'Administrative replacement' } },
        ],
      },
      SPACE_ID,
    );
    let settled = false;
    void replacement.then(() => (settled = true));
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(settled).toBe(false);

    releaseCommit.resolve(undefined);
    await committing;

    await expect(replacement).resolves.toEqual({
      kind: 'conflict',
      currentMetaSpaceId: SPACE_ID,
    });
    await expect(repository.loadSpace(SPACE_ID)).resolves.toMatchObject({
      revision: 1n,
      snapshot: { document: { title: 'Authored winner' } },
    });
  });

  /*
   * The regression this pins: a CI run failed asserting that the *second* of
   * two concurrent replacements is the one whose state survives. It is not the
   * call order that decides. Both proposals read the Meta identity they are
   * authorized against before either write lands, so both replace, and the
   * survivor is whichever PostgreSQL grants the Meta row lock to last.
   *
   * The blocking transaction is what the shared contract cannot have. It makes
   * the two genuinely overlap: issued back to back they might simply run one
   * after the other, and the second would then read the new identity and
   * conflict, so `replaced` twice is itself a race there and is asserted here
   * instead.
   */
  it('leaves one whole proposal when two replacements overlap on the Meta row lock', async () => {
    await repository.initializeAggregate({ metaSpaceId: SPACE_ID, spaces: [snapshot] });

    const metaLockHeld = Promise.withResolvers<undefined>();
    const releaseMetaLock = Promise.withResolvers<undefined>();
    const blocking = db.transaction(async ({ orm }) => {
      await orm.public.RepositoryState.where({ singletonId: 1 }).update({ metaSpaceId: SPACE_ID });
      metaLockHeld.resolve(undefined);
      await releaseMetaLock.promise;
    });
    await metaLockHeld.promise;

    const queuedFirst = repository.replaceAggregate(
      { metaSpaceId: OTHER_SPACE_ID, spaces: [otherSnapshot] },
      SPACE_ID,
    );
    await new Promise((resolve) => setTimeout(resolve, 250));
    const queuedSecond = repository.replaceAggregate(
      { metaSpaceId: CONCURRENT_SPACE_ID, spaces: [concurrentSnapshot] },
      SPACE_ID,
    );
    await new Promise((resolve) => setTimeout(resolve, 250));

    releaseMetaLock.resolve(undefined);
    await blocking;

    // Both replace, and the barrier is what makes that certain: neither could
    // take the lock while the blocking transaction held it, so both had already
    // read the identity they are authorized against by the time it released.
    await expect(Promise.all([queuedFirst, queuedSecond])).resolves.toMatchObject([
      { kind: 'replaced' },
      { kind: 'replaced' },
    ]);
    /*
     * Which one survives is not asserted. PostgreSQL serves the waiters in the
     * order they queue, but that is its behaviour rather than a promise it
     * makes, and a test that fixes a flake by depending on it has moved the
     * flake rather than removed it. What the store owes is that it holds one
     * proposal whole -- its Meta identity and its Space from the same
     * replacement, never a mixture of the two.
     */
    const loaded = await repository.loadAggregate();
    expect([
      {
        kind: 'loaded',
        aggregate: {
          metaSpaceId: OTHER_SPACE_ID,
          spaces: [{ snapshot: otherSnapshot, revision: 0n, exportedRevision: null }],
        },
      },
      {
        kind: 'loaded',
        aggregate: {
          metaSpaceId: CONCURRENT_SPACE_ID,
          spaces: [{ snapshot: concurrentSnapshot, revision: 0n, exportedRevision: null }],
        },
      },
    ]).toContainEqual(loaded);
  });

  it('persists first-working-load initialization for a fresh repository host', async () => {
    await seed(SPACE_ID, [snapshot]);

    const ids = [DIAGRAM_ID, GRAPH_ID];
    const first = await createWorkingSpaceLoader(repository, () => {
      const id = ids.shift();
      if (id === undefined) throw new Error('initializer minted too many identities');
      return id;
    })(SPACE_ID);

    // The revision alone, because `initialization` is gone: it existed so the
    // App could reveal the Things list after New Diagram, and New Diagram now
    // continues in the new Diagram's name instead (ADR 0089), so nothing reads
    // it. What this file is here to prove is unchanged — the initialization was
    // *committed* rather than derived per host, which is the revision and the
    // stored Diagram below.
    expect(first).toMatchObject({ revision: 1n });
    expect(first?.snapshot.document.diagrams?.[0]).toMatchObject({
      id: DIAGRAM_ID,
      positions: {},
      activeGraph: GRAPH_ID,
    });

    const freshHost = new PostgresSpaceRepository(db);
    await expect(
      createWorkingSpaceLoader(freshHost, () => {
        throw new Error('an initialized Space must not mint identities');
      })(SPACE_ID),
    ).resolves.toEqual({
      snapshot: first?.snapshot,
      revision: 1n,
      exportedRevision: null,
    });
  });

  it('prevents direct deletion of the Meta Space while repository state names it', async () => {
    await seed(SPACE_ID, [snapshot]);

    await expect(db.orm.public.Space.where({ id: SPACE_ID }).delete()).rejects.toThrow(
      'repository_state_meta_space_id_fkey',
    );
    await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual({
      snapshot,
      revision: 0n,
      exportedRevision: null,
    });
  });

  it('commits a topology-preserving edit without waiting for the repository singleton lock', async () => {
    await seed(SPACE_ID, [snapshot]);
    const lockAcquired = Promise.withResolvers<undefined>();
    const releaseLock = Promise.withResolvers<undefined>();
    const blocker = db.transaction(async ({ orm }) => {
      const state = await orm.public.RepositoryState.where({ singletonId: 1 }).first();
      if (state === null) throw new Error('Repository state was not seeded');
      await orm.public.RepositoryState.where({ singletonId: 1 }).update({
        metaSpaceId: state.metaSpaceId,
      });
      lockAcquired.resolve(undefined);
      await releaseLock.promise;
    });
    await lockAcquired.promise;

    try {
      const changed = {
        ...snapshot,
        document: { ...snapshot.document, title: 'Changed without aggregate lock' },
      };
      const timeout = new Promise<'timed-out'>((resolve) =>
        setTimeout(() => resolve('timed-out'), 500),
      );
      await expect(Promise.race([commitSpace(changed, 0n), timeout])).resolves.toEqual({
        kind: 'committed',
        revisions: [{ spaceId: SPACE_ID, revision: 1n }],
        deletedSpaceIds: [],
      });
    } finally {
      releaseLock.resolve(undefined);
      await blocker;
    }
  });

  it('refuses an unlocked single-Space write whose row moved after it read the revision', async () => {
    await seed(SPACE_ID, [snapshot]);

    /*
     * The same lost update as the multi-Space case below, on the path that has
     * no singleton lock to lose: two ordinary single-Space edits at one
     * revision. This is the plain two-writers case, and it needs no coordinated
     * edit to reach.
     */
    const updateApplied = Promise.withResolvers<undefined>();
    const releaseBlocker = Promise.withResolvers<undefined>();
    const blocker = db.transaction(async ({ orm }) => {
      await orm.public.Space.where({ id: SPACE_ID }).update({
        document: { version: 1, title: 'Moved by the other writer' },
        // Prisma Next declares `int8` inputs as `number`, so the literal needs
        // no relabelling here — unlike the adapter, which holds the same value
        // as the domain's `bigint`.
        revision: 1,
      });
      updateApplied.resolve(undefined);
      await releaseBlocker.promise;
    });
    await updateApplied.promise;

    const committing = commitSpace(
      { ...snapshot, document: { ...snapshot.document, title: 'Written against the stale read' } },
      0n,
    );
    let settled = false;
    void committing.then(() => (settled = true));
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(settled).toBe(false);

    releaseBlocker.resolve(undefined);
    await blocker;

    expect(await committing).toMatchObject({ kind: 'conflict' });
    // The writer that did commit is the one still standing.
    await expect(repository.loadSpace(SPACE_ID)).resolves.toMatchObject({
      revision: 1n,
      snapshot: { document: { title: 'Moved by the other writer' } },
    });
  });

  it('refuses a multi-Space write whose row moved after the conflict check read it', async () => {
    await seed(SPACE_ID, [linkedSnapshot, otherSnapshot]);

    /*
     * The lost update this closes is only reachable from the *other* writer:
     * `commitTopologyPreservingUpdate` runs before `lockRepositoryState`, so a
     * single-Space edit commits without ever taking the singleton lock the
     * multi-Space path serializes on. That leaves this window — the multi-Space
     * path's `loadEverySpace` read is lock-free, so a row can move under it
     * between the conflict check and the write.
     *
     * The barrier makes the window deterministic rather than merely likely. The
     * blocker's UPDATE lands *before* the commit starts, so the commit's own
     * read is guaranteed to run while that UPDATE is still uncommitted and, at
     * read committed, is guaranteed to see the pre-blocker revision. The
     * conflict check therefore always passes, and the stale revision can only
     * be caught at the write. Whether the commit reaches its write before or
     * after the blocker commits changes nothing, so there is no race to lose.
     */
    const updateApplied = Promise.withResolvers<undefined>();
    const releaseBlocker = Promise.withResolvers<undefined>();
    const blocker = db.transaction(async ({ orm }) => {
      await orm.public.Space.where({ id: OTHER_SPACE_ID }).update({
        document: { version: 1, title: 'Moved by the unlocked writer' },
        // Prisma Next declares `int8` inputs as `number`, so the literal needs
        // no relabelling here — unlike the adapter, which holds the same value
        // as the domain's `bigint`.
        revision: 1,
      });
      updateApplied.resolve(undefined);
      await releaseBlocker.promise;
    });
    await updateApplied.promise;

    const committing = repository.commit({
      changes: [
        {
          kind: 'update',
          spaceId: SPACE_ID,
          snapshot: {
            ...linkedSnapshot,
            document: { ...linkedSnapshot.document, title: 'Coordinated meta' },
          },
          expectedRevision: 0n,
        },
        {
          kind: 'update',
          spaceId: OTHER_SPACE_ID,
          snapshot: {
            ...otherSnapshot,
            document: { ...otherSnapshot.document, title: 'Coordinated other' },
          },
          expectedRevision: 0n,
        },
      ],
    });

    let settled = false;
    void committing.then(() => (settled = true));
    // Long enough for the commit to take the singleton lock, read the aggregate
    // at the pre-blocker revision, and reach the write that blocks on the
    // blocker's row lock. The assertion below is what proves it: a commit that
    // had already answered by now would have answered from its read, and the
    // write this case is about would never have run.
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(settled).toBe(false);

    releaseBlocker.resolve(undefined);
    await blocker;
    const result = await committing;

    expect(result).toEqual({
      kind: 'conflict',
      conflicts: [
        {
          spaceId: OTHER_SPACE_ID,
          current: {
            snapshot: {
              id: OTHER_SPACE_ID,
              document: { version: 1, title: 'Moved by the unlocked writer' },
              things: otherSnapshot.things,
            },
            revision: 1n,
            exportedRevision: null,
          },
        },
      ],
    });
    // The whole commit rolls back, so the Space the loop had already written is
    // left at the revision the losing commit never advanced past.
    await expect(repository.loadSpace(SPACE_ID)).resolves.toMatchObject({ revision: 0n });
  });

  it('commits an authoritative complete snapshot and advances its revision', async () => {
    await seed(SPACE_ID, [snapshot]);
    const changed: SpaceSnapshot = {
      ...snapshot,
      document: { ...snapshot.document, title: 'Committed space' },
      things: [
        {
          id: THING_ID,
          document: {
            title: 'Changed thing',
            kind: 'markdown',
            body: 'The newer complete snapshot wins.',
          },
        },
      ],
    };

    expect(await commitSpace(changed, 0n)).toEqual({
      kind: 'committed',
      revisions: [{ spaceId: SPACE_ID, revision: 1n }],
      deletedSpaceIds: [],
    });
    await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual({
      snapshot: changed,
      revision: 1n,
      exportedRevision: null,
    });
  });

  it('records the projected revision without hiding a concurrent edit', async () => {
    await seed(SPACE_ID, [snapshot]);
    const exported = await repository.loadSpace(SPACE_ID);
    expect(exported).toBeDefined();
    if (exported === undefined) throw new Error('The seeded space disappeared');
    const changed: SpaceSnapshot = {
      ...snapshot,
      document: { ...snapshot.document, title: 'Edited during export' },
    };

    await expect(commitSpace(changed, exported.revision)).resolves.toEqual({
      kind: 'committed',
      revisions: [{ spaceId: SPACE_ID, revision: 1n }],
      deletedSpaceIds: [],
    });
    await repository.markExported(SPACE_ID, exported.revision);

    await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual({
      snapshot: changed,
      revision: 1n,
      exportedRevision: 0n,
    });
  });

  it('returns the current aggregate for a stale revision without changing it', async () => {
    await seed(SPACE_ID, [snapshot]);
    const current: SpaceSnapshot = {
      ...snapshot,
      document: { ...snapshot.document, title: 'Current space' },
    };
    const stale: SpaceSnapshot = {
      ...snapshot,
      document: { ...snapshot.document, title: 'Stale overwrite' },
    };
    await commitSpace(current, 0n);

    expect(await commitSpace(stale, 0n)).toEqual({
      kind: 'conflict',
      conflicts: [
        {
          spaceId: SPACE_ID,
          current: { snapshot: current, revision: 1n, exportedRevision: null },
        },
      ],
    });
    await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual({
      snapshot: current,
      revision: 1n,
      exportedRevision: null,
    });
  });

  it('loads the space document and things from one aggregate revision', async () => {
    const atRevision = (revision: number): SpaceSnapshot => ({
      ...snapshot,
      document: { ...snapshot.document, title: `Revision ${revision}` },
      things: [
        {
          ...snapshot.things[0]!,
          document: { ...snapshot.things[0]!.document, title: `Revision ${revision}` },
        },
      ],
    });
    await seed(SPACE_ID, [atRevision(0)]);

    const writeRevisions = async () => {
      for (let revision = 1; revision <= 50; revision += 1) {
        await expect(
          commitSpace(atRevision(revision), BigInt(revision - 1)),
        ).resolves.toMatchObject({
          kind: 'committed',
          revisions: [{ spaceId: SPACE_ID, revision: BigInt(revision) }],
        });
      }
    };
    const readRevisions = async () => {
      for (let read = 0; read < 75; read += 1) {
        const loaded = await repository.loadSpace(SPACE_ID);
        expect(loaded).toBeDefined();
        if (loaded === undefined) throw new Error('The seeded space disappeared');

        const marker = `Revision ${loaded.revision}`;
        expect(loaded.snapshot.document.title).toBe(marker);
        expect(loaded.snapshot.things).toHaveLength(1);
        expect(loaded.snapshot.things[0]?.document.title).toBe(marker);
      }
    };

    await Promise.all([writeRevisions(), ...Array.from({ length: 4 }, readRevisions)]);
  });

  it('returns things in id order however they were stored', async () => {
    // Thing order is now the include aggregate's ORDER BY rather than a separate
    // query's, so it needs pinning at the one place that can tell the
    // difference: things supplied in reverse id order. Every other fixture here
    // supplies them already sorted, where an unordered aggregate would pass.
    const [first, second, third] = ORDERED_THING_IDS;
    const thing = (id: UUID, title: string) => ({
      id,
      document: { title, kind: 'markdown' as const, body: title },
    });
    createdSpaceIds.add(ORDERED_SPACE_ID);
    const result = await repository.initializeAggregate({
      metaSpaceId: ORDERED_SPACE_ID,
      spaces: [
        {
          id: ORDERED_SPACE_ID,
          document: { version: 1, title: 'Ordered things' },
          things: [thing(third, 'Third'), thing(second, 'Second'), thing(first, 'First')],
        },
      ],
    });
    expect(result.kind).toBe('initialized');
    if (result.kind !== 'initialized') {
      throw new Error(`The aggregate was not established: ${result.kind}`);
    }

    const order = (stored: LoadedSpace) => ({
      ids: stored.snapshot.things.map((thing) => thing.id),
      titles: stored.snapshot.things.map((thing) => thing.document.title),
    });
    const ascending = { ids: [first, second, third], titles: ['First', 'Second', 'Third'] };

    // Two reads, not one: the aggregate the door answers with comes from the
    // read-back inside its own transaction, and `loadSpace` is the same
    // aggregate read outside one. Only asserting the second would leave the
    // in-transaction path — the one place this read sees uncommitted rows —
    // unordered and unnoticed.
    expect(order(result.aggregate.spaces[0]!)).toEqual(ascending);

    const loaded = await repository.loadSpace(ORDERED_SPACE_ID);
    expect(loaded).toBeDefined();
    if (loaded === undefined) throw new Error('The seeded space disappeared');
    expect(order(loaded)).toEqual(ascending);
  });

  it('rejects a commit for an unknown space', async () => {
    const missing: SpaceSnapshot = {
      id: MISSING_SPACE_ID,
      document: { version: 1, title: 'Missing space' },
      things: [],
    };

    expect(await commitSpace(missing, 0n)).toEqual({
      kind: 'conflict',
      conflicts: [{ spaceId: MISSING_SPACE_ID, current: undefined }],
    });
    await expect(repository.loadSpace(MISSING_SPACE_ID)).resolves.toBeUndefined();
  });

  it('rejects a domain-invalid snapshot without changing the stored aggregate', async () => {
    await seed(SPACE_ID, [snapshot]);
    const invalid: SpaceSnapshot = {
      ...snapshot,
      document: {
        ...snapshot.document,
        diagrams: [
          {
            id: DIAGRAM_ID,
            title: 'Owner',
            kind: 'positioned',
            positions: { [THING_ID]: { x: 0, y: 0, open: false } },
            graphs: [
              {
                id: GRAPH_ID,
                title: 'Dangling graph',
                edges: [{ from: THING_ID, to: MISSING_THING_ID }],
              },
            ],
          },
        ],
      },
    };

    await expect(commitSpace(invalid, 0n)).resolves.toMatchObject({
      kind: 'aggregate-refused',
    });
    await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual({
      snapshot,
      revision: 0n,
      exportedRevision: null,
    });
  });

  it('rejects a thing owned by another space and rolls back the whole commit', async () => {
    await seed(SPACE_ID, [linkedSnapshot, otherSnapshot]);
    const claimed: SpaceSnapshot = {
      ...linkedSnapshot,
      document: { ...linkedSnapshot.document, title: 'Must roll back' },
      things: [...linkedSnapshot.things, otherSnapshot.things[0]!],
    };

    await expect(commitSpace(claimed, 0n)).resolves.toMatchObject({
      kind: 'aggregate-refused',
    });
    await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual({
      snapshot: linkedSnapshot,
      revision: 0n,
      exportedRevision: null,
    });
    await expect(repository.loadSpace(OTHER_SPACE_ID)).resolves.toEqual({
      snapshot: otherSnapshot,
      revision: 0n,
      exportedRevision: null,
    });
  });

  it('serializes concurrent topology commits so the loser observes the complete winner', async () => {
    await seed(SPACE_ID, [snapshot]);
    const firstRepository = new PostgresSpaceRepository(db);
    const secondRepository = new PostgresSpaceRepository(db);
    const firstTarget: SpaceSnapshot = {
      id: OTHER_SPACE_ID,
      document: {
        version: 1,
        title: 'First target',
        defaultDiagram: OTHER_SPACE_DIAGRAM_ID,
        diagrams: [
          {
            id: OTHER_SPACE_DIAGRAM_ID,
            title: 'Diagram 1',
            kind: 'positioned',
            positions: {},
            graphs: [{ id: OTHER_SPACE_GRAPH_ID, title: 'Graph 1', edges: [] }],
            activeGraph: OTHER_SPACE_GRAPH_ID,
          },
        ],
      },
      things: [],
    };
    const secondTarget: SpaceSnapshot = {
      id: CONCURRENT_SPACE_ID,
      document: {
        version: 1,
        title: 'Second target',
        defaultDiagram: CONCURRENT_DIAGRAM_ID,
        diagrams: [
          {
            id: CONCURRENT_DIAGRAM_ID,
            title: 'Diagram 1',
            kind: 'positioned',
            positions: {},
            graphs: [{ id: CONCURRENT_GRAPH_ID, title: 'Graph 1', edges: [] }],
            activeGraph: CONCURRENT_GRAPH_ID,
          },
        ],
      },
      things: [],
    };
    const firstLinked: SpaceSnapshot = {
      ...snapshot,
      things: [
        ...snapshot.things,
        {
          id: MISSING_THING_ID,
          document: {
            title: 'First link',
            kind: 'space',
            spaceId: OTHER_SPACE_ID,
            diagram: OTHER_SPACE_DIAGRAM_ID,
            graph: OTHER_SPACE_GRAPH_ID,
          },
        },
      ],
    };
    const secondLinked: SpaceSnapshot = {
      ...snapshot,
      things: [
        ...snapshot.things,
        {
          id: UNRESOLVED_THING_ID,
          document: {
            title: 'Second link',
            kind: 'space',
            spaceId: CONCURRENT_SPACE_ID,
            diagram: CONCURRENT_DIAGRAM_ID,
            graph: CONCURRENT_GRAPH_ID,
          },
        },
      ],
    };

    const results = await Promise.all([
      firstRepository.commit({
        changes: [
          {
            kind: 'update',
            spaceId: SPACE_ID,
            snapshot: firstLinked,
            expectedRevision: 0n,
          },
          { kind: 'create', spaceId: OTHER_SPACE_ID, snapshot: firstTarget },
        ],
      }),
      secondRepository.commit({
        changes: [
          {
            kind: 'update',
            spaceId: SPACE_ID,
            snapshot: secondLinked,
            expectedRevision: 0n,
          },
          { kind: 'create', spaceId: CONCURRENT_SPACE_ID, snapshot: secondTarget },
        ],
      }),
    ]);

    expect(results.filter((result) => result.kind === 'committed')).toHaveLength(1);
    expect(results.filter((result) => result.kind === 'conflict')).toHaveLength(1);
    const firstWon = results[0].kind === 'committed';
    const winningMeta = firstWon ? firstLinked : secondLinked;
    const winningTarget = firstWon ? firstTarget : secondTarget;
    const losingTargetId = firstWon ? CONCURRENT_SPACE_ID : OTHER_SPACE_ID;
    expect(results).toContainEqual({
      kind: 'conflict',
      conflicts: [
        {
          spaceId: SPACE_ID,
          current: {
            snapshot: winningMeta,
            revision: 1n,
            exportedRevision: null,
          },
        },
      ],
    });
    await expect(repository.loadAggregate()).resolves.toEqual({
      kind: 'loaded',
      aggregate: {
        metaSpaceId: SPACE_ID,
        spaces: [
          { snapshot: winningMeta, revision: 1n, exportedRevision: null },
          { snapshot: winningTarget, revision: 0n, exportedRevision: null },
        ],
      },
    });
    await expect(repository.loadSpace(losingTargetId)).resolves.toBeUndefined();
  });

  it('replaces every stored Space and Thing when the aggregate is replaced', async () => {
    await seed(SPACE_ID, [linkedSnapshot, otherSnapshot]);
    const replacement: SpaceSnapshot = {
      ...snapshot,
      document: { ...snapshot.document, title: 'Only remaining space' },
      things: [snapshot.things[0]!],
    };

    // Authorized by the Meta identity the caller is replacing, not by a mode
    // parameter (ADR 0078). The proposal drops both the Space Thing and the
    // Space it reached, which is the only way `otherSnapshot` can leave — a
    // proposal keeping the link and dropping the target would be refused as a
    // missing Space Thing target rather than performed.
    await expect(
      repository.replaceAggregate({ metaSpaceId: SPACE_ID, spaces: [replacement] }, SPACE_ID),
    ).resolves.toEqual({
      kind: 'replaced',
      aggregate: {
        metaSpaceId: SPACE_ID,
        spaces: [{ snapshot: replacement, revision: 0n, exportedRevision: null }],
      },
    });
    await expect(repository.listSpaces()).resolves.toEqual([
      { id: SPACE_ID, title: 'Only remaining space' },
    ]);
    await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual({
      snapshot: replacement,
      revision: 0n,
      exportedRevision: null,
    });
    await expect(repository.loadSpace(OTHER_SPACE_ID)).resolves.toBeUndefined();
  });

  it('refuses an invalid replacement before it truncates anything', async () => {
    await seed(SPACE_ID, [linkedSnapshot, otherSnapshot]);
    const replacement: SpaceSnapshot = {
      ...snapshot,
      document: { ...snapshot.document, title: 'Must roll back' },
    };
    const invalid: SpaceSnapshot = {
      id: CONCURRENT_SPACE_ID,
      document: {
        version: 1,
        title: 'Invalid later space',
        diagrams: [
          {
            id: DIAGRAM_ID,
            title: 'Dangling diagram',
            kind: 'positioned',
            positions: {},
            graphs: [
              {
                id: GRAPH_ID,
                title: 'Dangling graph',
                edges: [{ from: UNRESOLVED_THING_ID, to: MISSING_THING_ID }],
              },
            ],
          },
        ],
      },
      things: [],
    };

    // Complete intake runs before the transaction opens, so "rolls back" is now
    // "never started": there is one validated proposal rather than a batch
    // written Space by Space, and a refusal cannot leave half of it behind.
    // What still has to hold is the stored side — both seeded Spaces untouched
    // at the revision they were seeded at.
    await expect(
      repository.replaceAggregate(
        { metaSpaceId: SPACE_ID, spaces: [replacement, invalid] },
        SPACE_ID,
      ),
    ).resolves.toMatchObject({ kind: 'aggregate-refused' });
    await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual({
      snapshot: linkedSnapshot,
      revision: 0n,
      exportedRevision: null,
    });
    await expect(repository.loadSpace(OTHER_SPACE_ID)).resolves.toEqual({
      snapshot: otherSnapshot,
      revision: 0n,
      exportedRevision: null,
    });
    await expect(repository.loadSpace(CONCURRENT_SPACE_ID)).resolves.toBeUndefined();
  });

  it('passes expected revisions beyond the safe integer range without narrowing', async () => {
    await seed(SPACE_ID, [snapshot]);
    const unsafeRevision = BigInt(Number.MAX_SAFE_INTEGER) + 1n;

    await expect(commitSpace(snapshot, unsafeRevision)).resolves.toEqual({
      kind: 'conflict',
      conflicts: [
        {
          spaceId: SPACE_ID,
          current: { snapshot, revision: 0n, exportedRevision: null },
        },
      ],
    });
  });

  it('stores two Spaces of one aggregate that reuse a graph id', async () => {
    // A graph id is unique across the space that holds it and no wider — its
    // owner is one diagram (ADR 0040), and the flatten a space-subject view draws
    // is what makes the space the scope (ADR 0045). Two spaces reusing one is
    // therefore fine.
    // There is no graphs table and no diagrams table (ADR 0030 keeps both nested),
    // and every query in the repository is by space id or thing id, so no lookup
    // anywhere can be made ambiguous by the reuse below. Space and thing ids are
    // rows and stay globally unique — enforced by their primary keys, which the
    // duplicate-identity and thing-ownership rules in the shared contract cover.
    //
    // Guards a decision, not a bug: scanning every stored document to reject
    // this would cost a full table read per Space stored and protect nothing.
    //
    // The Space Thing sharpens it rather than merely satisfying the
    // referenced-Space rule: it names `DIAGRAM_ID` and `GRAPH_ID` while sitting
    // in a Space whose own Diagram and Graph carry those very ids, so a
    // resolver that looked them up anywhere but in the target would find the
    // wrong pair and still find something.
    const first: SpaceSnapshot = {
      id: SPACE_ID,
      document: {
        version: 1,
        title: 'First space',
        diagrams: [
          {
            id: DIAGRAM_ID,
            title: 'Owner',
            kind: 'positioned',
            positions: {
              [THING_ID]: { x: 0, y: 0, open: false },
              [OMITTED_THING_ID]: { x: 300, y: 0, open: false },
            },
            graphs: [
              {
                id: GRAPH_ID,
                title: 'Shared graph id',
                edges: [{ from: THING_ID, to: OMITTED_THING_ID }],
              },
            ],
          },
        ],
      },
      things: [
        { id: THING_ID, document: { title: 'From', kind: 'markdown', body: 'First.' } },
        { id: OMITTED_THING_ID, document: { title: 'To', kind: 'markdown', body: 'First.' } },
        {
          id: LINK_THING_ID,
          document: {
            title: 'To the second space',
            kind: 'space',
            spaceId: OTHER_SPACE_ID,
            diagram: DIAGRAM_ID,
            graph: GRAPH_ID,
          },
        },
      ],
    };
    const second: SpaceSnapshot = {
      id: OTHER_SPACE_ID,
      document: {
        version: 1,
        title: 'Second space',
        diagrams: [
          {
            id: DIAGRAM_ID,
            title: 'Owner',
            kind: 'positioned',
            positions: {
              [OTHER_THING_ID]: { x: 0, y: 0, open: false },
              [MIXED_FIRST_THING_ID]: { x: 300, y: 0, open: false },
            },
            graphs: [
              {
                id: GRAPH_ID,
                title: 'Same graph id, other space',
                edges: [{ from: OTHER_THING_ID, to: MIXED_FIRST_THING_ID }],
              },
            ],
          },
        ],
      },
      things: [
        { id: OTHER_THING_ID, document: { title: 'From', kind: 'markdown', body: 'Second.' } },
        { id: MIXED_FIRST_THING_ID, document: { title: 'To', kind: 'markdown', body: 'Second.' } },
      ],
    };

    await seed(SPACE_ID, [first, second]);

    await expect(repository.loadSpace(SPACE_ID)).resolves.toMatchObject({
      snapshot: {
        document: { diagrams: [{ graphs: [{ id: GRAPH_ID, title: 'Shared graph id' }] }] },
      },
    });
    await expect(repository.loadSpace(OTHER_SPACE_ID)).resolves.toMatchObject({
      snapshot: {
        document: {
          diagrams: [{ graphs: [{ id: GRAPH_ID, title: 'Same graph id, other space' }] }],
        },
      },
    });
  });

  it('refuses the same pair when nothing reaches the second Space', async () => {
    // The pair above with the Space Thing taken out, and it is the *link* that
    // the refusal is about, never the shared graph id. There is one door and
    // one collection now — the batch boundary that used to be worth contrasting
    // against a sequence of inserts no longer exists — so what this holds down
    // is that graph-id reuse stays legal while the Space nothing references
    // does not (`ordinary-space-unreferenced`).
    const first: SpaceSnapshot = {
      id: SPACE_ID,
      document: {
        version: 1,
        title: 'First space',
        diagrams: [
          {
            id: DIAGRAM_ID,
            title: 'Owner',
            kind: 'positioned',
            positions: {
              [THING_ID]: { x: 0, y: 0, open: false },
              [OMITTED_THING_ID]: { x: 300, y: 0, open: false },
            },
            graphs: [
              {
                id: GRAPH_ID,
                title: 'Shared graph id',
                edges: [{ from: THING_ID, to: OMITTED_THING_ID }],
              },
            ],
          },
        ],
      },
      things: [
        { id: THING_ID, document: { title: 'From', kind: 'markdown', body: 'First.' } },
        { id: OMITTED_THING_ID, document: { title: 'To', kind: 'markdown', body: 'First.' } },
      ],
    };
    const second: SpaceSnapshot = {
      id: OTHER_SPACE_ID,
      document: {
        version: 1,
        title: 'Second space',
        diagrams: [
          {
            id: DIAGRAM_ID,
            title: 'Owner',
            kind: 'positioned',
            positions: {
              [OTHER_THING_ID]: { x: 0, y: 0, open: false },
              [MIXED_FIRST_THING_ID]: { x: 300, y: 0, open: false },
            },
            graphs: [
              {
                id: GRAPH_ID,
                title: 'Same graph id',
                edges: [{ from: OTHER_THING_ID, to: MIXED_FIRST_THING_ID }],
              },
            ],
          },
        ],
      },
      things: [
        { id: OTHER_THING_ID, document: { title: 'From', kind: 'markdown', body: 'Second.' } },
        { id: MIXED_FIRST_THING_ID, document: { title: 'To', kind: 'markdown', body: 'Second.' } },
      ],
    };

    await expect(
      repository.initializeAggregate({ metaSpaceId: SPACE_ID, spaces: [first, second] }),
    ).resolves.toEqual({
      kind: 'aggregate-refused',
      errors: [{ kind: 'ordinary-space-unreferenced', spaceId: OTHER_SPACE_ID }],
    });
    await expect(repository.loadAggregate()).resolves.toEqual({ kind: 'uninitialized' });
  });

  it('stores a Space whose graph id equals one of its thing ids', async () => {
    // Entity kinds do not share an identity space. Intake checks each kind
    // separately — things among things, graphs among graphs — so a UUID naming
    // both a thing and a graph names two different things unambiguously.
    const shared: SpaceSnapshot = {
      id: SPACE_ID,
      document: {
        version: 1,
        title: 'Graph id equals thing id',
        diagrams: [
          {
            id: DIAGRAM_ID,
            title: 'Owner',
            kind: 'positioned',
            positions: {
              [THING_ID]: { x: 0, y: 0, open: false },
              [OMITTED_THING_ID]: { x: 300, y: 0, open: false },
            },
            graphs: [
              {
                id: THING_ID,
                title: 'Graph named like a thing',
                edges: [{ from: THING_ID, to: OMITTED_THING_ID }],
              },
            ],
          },
        ],
      },
      things: [
        { id: THING_ID, document: { title: 'From', kind: 'markdown', body: 'Shared.' } },
        { id: OMITTED_THING_ID, document: { title: 'To', kind: 'markdown', body: 'Shared.' } },
      ],
    };

    await seed(SPACE_ID, [shared]);

    await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual({
      snapshot: shared,
      revision: 0n,
      exportedRevision: null,
    });
  });

  it('rejects two diagrams owning a graph under one id', async () => {
    // Single-Space intake's job, and the reason nothing above it looks at graph
    // ids at all. A graph id is unique across the space although one diagram
    // owns it (ADR 0045), so the collision worth catching is the one that spans
    // owners — and it is caught by the same `loadSpaceSnapshot` a commit goes
    // through, before the lifecycle door opens a transaction.
    const collidingGraphs: SpaceSnapshot = {
      ...snapshot,
      document: {
        ...snapshot.document,
        diagrams: [
          {
            id: DIAGRAM_ID,
            title: 'First owner',
            kind: 'positioned',
            positions: {
              [THING_ID]: { x: 0, y: 0, open: false },
              [OMITTED_THING_ID]: { x: 300, y: 0, open: false },
            },
            graphs: [
              { id: GRAPH_ID, title: 'First', edges: [{ from: THING_ID, to: OMITTED_THING_ID }] },
            ],
          },
          {
            id: OTHER_DIAGRAM_ID,
            title: 'Second owner',
            kind: 'positioned',
            positions: {
              [THING_ID]: { x: 0, y: 0, open: false },
              [OMITTED_THING_ID]: { x: 300, y: 0, open: false },
            },
            graphs: [
              { id: GRAPH_ID, title: 'Second', edges: [{ from: OMITTED_THING_ID, to: THING_ID }] },
            ],
          },
        ],
      },
    };

    await expect(
      repository.initializeAggregate({ metaSpaceId: SPACE_ID, spaces: [collidingGraphs] }),
    ).resolves.toMatchObject({
      kind: 'aggregate-refused',
      errors: [{ kind: 'invalid-space-snapshot', snapshotIndex: 0 }],
    });
    await expect(repository.loadSpace(SPACE_ID)).resolves.toBeUndefined();
    await expect(repository.loadAggregate()).resolves.toEqual({ kind: 'uninitialized' });
  });
});
