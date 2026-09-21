import { uuidSchema, type SpaceSnapshot, type UUID } from '@project/core';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { toJsonValue } from '../../src/persistence/sql-store';
import { SqlSpaceRepository } from '../../src/persistence/sql-space-repository';
import { postgresTestDatabase as db } from '../support/postgres-database';
import { postgresSqlStore } from '../../src/prisma/sql-store';
import { clearHyperContent } from '../support/clear-hyper-content';
import { spaceRepositoryContract } from '../support/repository-contract';
import { expectPersisted } from '../support/persistence-contract';

/**
 * Every Hyper row, gone. The same deletion `--dangerous-truncate` performs, and safe
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
// that the SQL repository could not.
//
// Ticket 24: `SqlSpaceRepository` now owns `commit` too, so the whole
// contract -- lifecycle and commit alike -- runs directly against it; the
// ticket 22/23 tracer and lifecycle-only wiring this block used to carry
// beside it are gone, superseded by this one call covering everything they
// each covered separately.
spaceRepositoryContract('SqlSpaceRepository (PostgreSQL)', async () => {
  await clearHyperContent();
  return {
    repository: new SqlSpaceRepository(postgresSqlStore(db)),
    close: clearHyperContent,
    reopenRepository: () => Promise.resolve(new SqlSpaceRepository(postgresSqlStore(db))),
    arrangeBrokenState: async (kind, ids) => {
      if (kind === 'invalid-space-document') {
        await db.orm.public.Space.create({
          id: ids.spaceId,
          document: { version: 1 },
          revision: '0',
        });
        await db.orm.public.RepositoryState.create({ singletonId: 1, metaSpaceId: ids.spaceId });
        return { expectedMetaSpaceId: ids.spaceId };
      }
      await db.orm.public.Space.create({
        id: ids.spaceId,
        document: { version: 1, title: 'Meta' },
        revision: '0',
      });
      await db.orm.public.Space.create({
        id: ids.otherSpaceId,
        document: { version: 1, title: 'Unreferenced' },
        revision: '0',
      });
      await db.orm.public.RepositoryState.create({ singletonId: 1, metaSpaceId: ids.spaceId });
      return { expectedMetaSpaceId: ids.spaceId };
    },
    removeMetaIdentity: async () => {
      await db.orm.public.RepositoryState.where({ singletonId: 1 }).delete();
    },
    writeRawRevision: async ({ spaceId, revision, exportedRevision }) => {
      if (exportedRevision === undefined) {
        await db.orm.public.Space.where({ id: spaceId }).update({ revision });
        return;
      }
      await db.orm.public.Space.where({ id: spaceId }).update({ revision, exportedRevision });
    },
  };
});

const SPACE_ID = uuidSchema.parse('11111111-1111-4111-8111-111111111111');
const RESOURCE_ID = uuidSchema.parse('22222222-2222-4222-8222-222222222222');
const OMITTED_RESOURCE_ID = uuidSchema.parse('33333333-3333-4333-8333-333333333333');
const MISSING_RESOURCE_ID = uuidSchema.parse('66666666-6666-4666-8666-666666666666');
const OTHER_SPACE_ID = uuidSchema.parse('77777777-7777-4777-8777-777777777777');
const OTHER_RESOURCE_ID = uuidSchema.parse('88888888-8888-4888-8888-888888888888');
const CONCURRENT_SPACE_ID = uuidSchema.parse('99999999-9999-4999-8999-999999999999');
const CONCURRENT_RESOURCE_ID = uuidSchema.parse('9a9a9a9a-9a9a-4a9a-8a9a-9a9a9a9a9a9a');
const UNRESOLVED_RESOURCE_ID = uuidSchema.parse('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
const LINK_RESOURCE_ID = uuidSchema.parse('ffffffff-ffff-4fff-8fff-ffffffffffff');
const OTHER_SPACE_MAP_ID = uuidSchema.parse('0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c');
const OTHER_SPACE_GRAPH_ID = uuidSchema.parse('0d0d0d0d-0d0d-4d0d-8d0d-0d0d0d0d0d0d');
const CONCURRENT_MAP_ID = uuidSchema.parse('0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e');
const CONCURRENT_GRAPH_ID = uuidSchema.parse('0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f');
const RACE_CHILD_SPACE_ID = uuidSchema.parse('1a1a1a1a-1a1a-4a1a-8a1a-1a1a1a1a1a1a');
const RACE_CHILD_MAP_ID = uuidSchema.parse('1b1b1b1b-1b1b-4b1b-8b1b-1b1b1b1b1b1b');
const RACE_CHILD_GRAPH_ID = uuidSchema.parse('1c1c1c1c-1c1c-4c1c-8c1c-1c1c1c1c1c1c');
const RACE_LINK_RESOURCE_ID = uuidSchema.parse('1d1d1d1d-1d1d-4d1d-8d1d-1d1d1d1d1d1d');

const snapshot: SpaceSnapshot = {
  id: SPACE_ID,
  document: {
    version: 1,
    title: 'Repository space',
  },
  resources: [
    {
      id: RESOURCE_ID,
      document: {
        title: 'Stored resource',
        kind: 'markdown',
        body: 'Stored through the repository.',
      },
    },
    {
      id: OMITTED_RESOURCE_ID,
      document: {
        title: 'Resource to remove',
        kind: 'markdown',
        body: 'Runtime commits are authoritative.',
      },
    },
  ],
};

/*
 * The Space every Space Resource below points at, carrying the Map and Graph
 * those Resources select. A Space Resource names a Map of its target and a Graph
 * that Map owns from the moment it exists (ADR 0079), so a target with no
 * Map is one nothing valid can reference. The Map positions nothing:
 * several cases here replace this Space's Resources, and what a Space Resource
 * resolves is the Map and the Graph rather than what that Map places.
 */
const otherSnapshot: SpaceSnapshot = {
  id: OTHER_SPACE_ID,
  document: {
    version: 1,
    title: 'Other space',
    defaultMap: OTHER_SPACE_MAP_ID,
    maps: [
      {
        id: OTHER_SPACE_MAP_ID,
        title: 'Map 1',
        kind: 'positioned',
        positions: {},
        graphs: [{ id: OTHER_SPACE_GRAPH_ID, title: 'Graph 1', edges: [] }],
        activeGraph: OTHER_SPACE_GRAPH_ID,
      },
    ],
  },
  resources: [
    {
      id: OTHER_RESOURCE_ID,
      document: {
        title: 'Other resource',
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
  resources: [
    {
      id: CONCURRENT_RESOURCE_ID,
      document: {
        title: 'Concurrent resource',
        kind: 'markdown',
        body: 'Owned by the concurrent space.',
      },
    },
  ],
};

/**
 * `snapshot` with the Space Resource that makes `otherSnapshot` part of the same
 * aggregate.
 *
 * A two-Space seed is not two Spaces side by side any more. Complete aggregate
 * intake refuses an ordinary Space nothing references
 * (`ordinary-space-unreferenced`), and both lifecycle doors ask it before they
 * write — so the pair that used to arrive through two insert-mode imports has
 * to arrive as one aggregate with Meta reaching the other Space (ADR 0078).
 *
 * It selects `otherSnapshot`'s own Map and Graph, which a Space Resource names
 * from the moment it exists (ADR 0079).
 */
const linkedSnapshot: SpaceSnapshot = {
  ...snapshot,
  resources: [
    ...snapshot.resources,
    {
      id: LINK_RESOURCE_ID,
      document: {
        title: 'Other Space',
        kind: 'space',
        spaceId: OTHER_SPACE_ID,
        map: OTHER_SPACE_MAP_ID,
        graph: OTHER_SPACE_GRAPH_ID,
      },
    },
  ],
};

// Ticket 24 note: this file used to carry a separate `describe('SqlSpaceRepository
// (PostgreSQL) -- Meta-lock retry race', ...)` block here, added by ticket 23 to
// prove the race directly on `SqlSpaceRepository` while `commit` still lived on
// the now-deleted `PostgresSpaceRepository`. The block below runs on
// `SqlSpaceRepository` too now, and already carries both halves of that race --
// "conflicts a replacement authorized against an identity a concurrent
// replacement retired" and "judges a complete-aggregate commit against an
// identity a concurrent replacement retired" -- so the separate block was
// deleted as a literal duplicate rather than kept beside it.
describe('SqlSpaceRepository (PostgreSQL)', () => {
  const repository = new SqlSpaceRepository(postgresSqlStore(db));
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
      await db.orm.public.Resource.where({ spaceId: id }).deleteAll();
      await db.orm.public.Space.where({ id }).delete();
    }
    createdSpaceIds.clear();
    await db.orm.public.Resource.where({ spaceId: SPACE_ID }).deleteAll();
    await db.orm.public.Resource.where({ spaceId: OTHER_SPACE_ID }).deleteAll();
    await db.orm.public.Resource.where({ spaceId: CONCURRENT_SPACE_ID }).deleteAll();
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
  it('refuses a write of text that is not JSON into spaces.document', async () => {
    createdSpaceIds.add(OTHER_SPACE_ID);
    await db.transaction(async ({ orm }) => {
      await orm.public.Space.create({
        id: OTHER_SPACE_ID,
        document: { version: 1, title: 'Corruptible' },
        revision: '0',
      });
    });

    const corrupt = db.sql.public.spaces
      .update(() => ({ document: db.raw`'not json'`.returns('pg/jsonb@1') }))
      .where((fields, fns) => fns.eq(fields.id, OTHER_SPACE_ID))
      .build();

    await expect(db.runtime().execute(corrupt)).rejects.toThrow();
  });

  /*
   * Replacement truncates stored state whether or not it is an aggregate
   * (ADR 0094), still authorized by the Meta identity it read. Each state is
   * written raw because no lifecycle door stores it.
   */
  describe('truncating stored state that is not an aggregate', () => {
    const replacement: SpaceSnapshot = {
      id: SPACE_ID,
      document: { version: 1, title: 'Replacement' },
      resources: [],
    };

    it('settles two overlapping truncations of Spaces stored without Meta as results', async () => {
      createdSpaceIds.add(OTHER_SPACE_ID);
      createdSpaceIds.add(CONCURRENT_SPACE_ID);
      await db.orm.public.Space.create({
        id: CONCURRENT_SPACE_ID,
        document: { version: 1, title: 'Orphan' },
        revision: '0',
      });

      const rowLockHeld = Promise.withResolvers<undefined>();
      const releaseRowLock = Promise.withResolvers<undefined>();
      const blocking = db.transaction(async ({ orm }) => {
        await orm.public.Space.where({ id: CONCURRENT_SPACE_ID }).update({
          document: { version: 1, title: 'Orphan' },
        });
        rowLockHeld.resolve(undefined);
        await releaseRowLock.promise;
      });
      await rowLockHeld.promise;

      const first = repository.replaceAggregate(
        { metaSpaceId: SPACE_ID, spaces: [replacement] },
        undefined,
      );
      await new Promise((resolve) => setTimeout(resolve, 250));
      const second = repository.replaceAggregate(
        { metaSpaceId: OTHER_SPACE_ID, spaces: [otherSnapshot] },
        undefined,
      );
      await new Promise((resolve) => setTimeout(resolve, 250));
      releaseRowLock.resolve(undefined);
      await blocking;

      const results = await Promise.allSettled([first, second]);
      expect(results.map(({ status }) => status)).toEqual(['fulfilled', 'fulfilled']);
      expect(
        results.map((result) => (result.status === 'fulfilled' ? result.value.kind : undefined)),
      ).toContain('replaced');
      const loaded = await repository.loadAggregate();
      expect([
        {
          kind: 'loaded',
          aggregate: {
            metaSpaceId: SPACE_ID,
            spaces: [{ snapshot: replacement, revision: 0n, exportedRevision: null }],
          },
        },
        {
          kind: 'loaded',
          aggregate: {
            metaSpaceId: OTHER_SPACE_ID,
            spaces: [{ snapshot: otherSnapshot, revision: 0n, exportedRevision: null }],
          },
        },
      ]).toContainEqual(loaded);
    });
  });

  it('classifies initialization when a concurrent winner takes a shared Resource identity', async () => {
    const winnerReady = Promise.withResolvers<undefined>();
    const releaseWinner = Promise.withResolvers<undefined>();
    const winner = db.transaction(async ({ orm }) => {
      await orm.public.Space.create({
        id: SPACE_ID,
        document: { version: 1, title: 'Winner' },
        revision: '0',
      });
      await orm.public.Resource.create({
        id: RESOURCE_ID,
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
      resources: [
        {
          id: RESOURCE_ID,
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

    expectPersisted(await initializing).toMatchObject({ kind: 'already-initialized' });
  });

  it('conflicts when an authored commit wins after replacement reads its baseline', async () => {
    await repository.initializeAggregate({ metaSpaceId: SPACE_ID, spaces: [snapshot] });
    const updateApplied = Promise.withResolvers<undefined>();
    const releaseCommit = Promise.withResolvers<undefined>();
    const committing = db.transaction(async ({ orm }) => {
      await orm.public.Space.where({ id: SPACE_ID }).update({
        document: { version: 1, title: 'Authored winner' },
        revision: '1',
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
    expectPersisted(await repository.loadSpace(SPACE_ID)).toMatchObject({
      revision: 1n,
      snapshot: { document: { title: 'Authored winner' } },
    });
  });

  /*
   * The regression this used to pin, before ticket 23: a CI run failed
   * asserting that the *second* of two concurrent replacements is the one
   * whose state survives, and the fix at the time was to stop asserting which
   * one survives -- both proposals read the Meta identity they are authorized
   * against before either write lands, so (that version reasoned) both
   * replace, and the survivor is whichever PostgreSQL grants the Meta row
   * lock to last.
   *
   * That reasoning missed a second race living inside the same window: the
   * *loser* of the row-lock queue does not simply wait its turn and then
   * write against the row it originally read. The winner's whole
   * `replaceAggregate` -- including `truncateHyperContent`'s delete of the very
   * row the loser is blocked on -- runs and commits before the loser's blocked
   * self-update ever unblocks, so the loser meets exactly ticket 23's race
   * (`lockMetaIdentity`'s self-update finds the row gone) and, correctly
   * fixed, conflicts against the identity the winner just established rather
   * than silently overwriting it. `expectPersisted(...).toMatchObject([{kind:
   * 'replaced'}, {kind: 'replaced'}])` no longer holds -- exactly one of the
   * two replaces, the other conflicts, and this is now where that is pinned.
   *
   * The blocking transaction is what the shared contract cannot have. It makes
   * the two genuinely overlap: issued back to back they might simply run one
   * after the other, and the second would then read the new identity outright
   * and conflict for that unrelated reason, which is not the race this test is
   * about.
   */
  it('conflicts the loser when two replacements overlap on the Meta row lock', async () => {
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

    const results = await Promise.all([queuedFirst, queuedSecond]);
    // Neither could take the lock while the blocking transaction held it, so
    // both had already read the identity they were authorized against
    // (`SPACE_ID`) by the time it released -- but only one of them can then be
    // the one PostgreSQL grants the row lock to first, and that one's own
    // replacement retires `SPACE_ID` out from under the other, which is
    // ticket 23's race. Which one wins is not asserted, for the same reason
    // the sibling "leaves one whole proposal" test below does not assert it.
    expect(results.filter((result) => result.kind === 'replaced')).toHaveLength(1);
    expect(results.filter((result) => result.kind === 'conflict')).toHaveLength(1);
    const winnerIsFirst = results[0].kind === 'replaced';
    const winningMetaSpaceId = winnerIsFirst ? OTHER_SPACE_ID : CONCURRENT_SPACE_ID;
    const winningSnapshot = winnerIsFirst ? otherSnapshot : concurrentSnapshot;
    expect(results).toContainEqual({ kind: 'conflict', currentMetaSpaceId: winningMetaSpaceId });
    await expect(repository.loadAggregate()).resolves.toEqual({
      kind: 'loaded',
      aggregate: {
        metaSpaceId: winningMetaSpaceId,
        spaces: [{ snapshot: winningSnapshot, revision: 0n, exportedRevision: null }],
      },
    });
  });

  /*
   * Ticket 23: `lockMetaIdentity`'s self-update finds the singleton row gone
   * when a concurrent replacement has deleted and rewritten it between this
   * read and that self-update. `4ec1d1e7` ("Preserve replacement
   * authorization across lock retry") made the retry's caller receive the
   * identity read *before* the replacement rather than the one the retry
   * itself just found -- and nothing failed if that were reversed. This pins
   * which is correct: a manually held row lock stands in for a replacement
   * mid-flight, so `replaceAggregate`'s own read is forced to land before the
   * held lock's release and its self-update is forced to block on it, then
   * the held transaction retires the identity `replaceAggregate` read and
   * commits an entirely different one before releasing.
   */
  it('conflicts a replacement authorized against an identity a concurrent replacement retired', async () => {
    await repository.initializeAggregate({ metaSpaceId: SPACE_ID, spaces: [snapshot] });

    const lockHeld = Promise.withResolvers<undefined>();
    const releaseLock = Promise.withResolvers<undefined>();
    const blocker = db.transaction(async ({ orm }) => {
      // Take the singleton row's write lock exactly where `lockMetaIdentity`'s
      // own self-update would, so the racing call blocks on this transaction
      // rather than on a second real replacement's own lock-acquisition timing.
      await orm.public.RepositoryState.where({ singletonId: 1 }).update({ metaSpaceId: SPACE_ID });
      lockHeld.resolve(undefined);
      await releaseLock.promise;
      // What the held lock stands in for: retire the identity the racing call
      // already read and establish an entirely different one, before releasing
      // the lock the racing call's self-update has been waiting on all along.
      await orm.public.RepositoryState.where({ singletonId: 1 }).delete();
      await orm.public.Resource.where({ spaceId: SPACE_ID }).deleteAll();
      await orm.public.Space.where({ id: SPACE_ID }).delete();
      await orm.public.Space.create({
        id: OTHER_SPACE_ID,
        document: toJsonValue(otherSnapshot.document),
        revision: '0',
      });
      for (const resource of otherSnapshot.resources) {
        await orm.public.Resource.create({
          id: resource.id,
          spaceId: OTHER_SPACE_ID,
          document: toJsonValue(resource.document),
        });
      }
      await orm.public.RepositoryState.create({ singletonId: 1, metaSpaceId: OTHER_SPACE_ID });
    });
    await lockHeld.promise;

    const racing = repository.replaceAggregate(
      {
        metaSpaceId: SPACE_ID,
        spaces: [{ ...snapshot, document: { ...snapshot.document, title: 'Must not land' } }],
      },
      SPACE_ID,
    );
    await new Promise((resolve) => setTimeout(resolve, 250));
    releaseLock.resolve(undefined);
    await blocker;

    // The identity `replaceAggregate` was authorized against (`SPACE_ID`) is
    // gone by the time its write would land -- a conflict naming the identity
    // now actually stored, never a silent overwrite of the replacement that
    // retired it.
    await expect(racing).resolves.toEqual({ kind: 'conflict', currentMetaSpaceId: OTHER_SPACE_ID });
    await expect(repository.loadAggregate()).resolves.toEqual({
      kind: 'loaded',
      aggregate: {
        metaSpaceId: OTHER_SPACE_ID,
        spaces: [{ snapshot: otherSnapshot, revision: 0n, exportedRevision: null }],
      },
    });
  });

  /*
   * The same race, reaching `commit`'s own `lockMetaIdentity` call instead
   * (`#commitInTransaction`, past the topology-preserving fast path, which a
   * two-change commit never takes). The candidate this commit proposes is
   * only valid rooted at the identity the concurrent replacement actually
   * established, never at the one the racing call read: judged against the
   * stale identity, `loadSpaceAggregate` cannot find it among the now-current
   * Spaces at all and the commit is wrongly refused as an invariant failure;
   * judged against the current identity, it commits.
   */
  it('judges a complete-aggregate commit against an identity a concurrent replacement retired', async () => {
    createdSpaceIds.add(RACE_CHILD_SPACE_ID);
    const linkedOther: SpaceSnapshot = {
      ...otherSnapshot,
      resources: [
        ...otherSnapshot.resources,
        {
          id: RACE_LINK_RESOURCE_ID,
          document: {
            title: 'To the race child',
            kind: 'space',
            spaceId: RACE_CHILD_SPACE_ID,
            map: RACE_CHILD_MAP_ID,
            graph: RACE_CHILD_GRAPH_ID,
          },
        },
      ],
    };
    const raceChild: SpaceSnapshot = {
      id: RACE_CHILD_SPACE_ID,
      document: {
        version: 1,
        title: 'Race child',
        defaultMap: RACE_CHILD_MAP_ID,
        maps: [
          {
            id: RACE_CHILD_MAP_ID,
            title: 'Map 1',
            kind: 'positioned',
            positions: {},
            graphs: [{ id: RACE_CHILD_GRAPH_ID, title: 'Graph 1', edges: [] }],
            activeGraph: RACE_CHILD_GRAPH_ID,
          },
        ],
      },
      resources: [],
    };
    await repository.initializeAggregate({ metaSpaceId: SPACE_ID, spaces: [snapshot] });

    const lockHeld = Promise.withResolvers<undefined>();
    const releaseLock = Promise.withResolvers<undefined>();
    const blocker = db.transaction(async ({ orm }) => {
      await orm.public.RepositoryState.where({ singletonId: 1 }).update({ metaSpaceId: SPACE_ID });
      lockHeld.resolve(undefined);
      await releaseLock.promise;
      await orm.public.RepositoryState.where({ singletonId: 1 }).delete();
      await orm.public.Resource.where({ spaceId: SPACE_ID }).deleteAll();
      await orm.public.Space.where({ id: SPACE_ID }).delete();
      await orm.public.Space.create({
        id: OTHER_SPACE_ID,
        document: toJsonValue(linkedOther.document),
        revision: '0',
      });
      for (const resource of linkedOther.resources) {
        await orm.public.Resource.create({
          id: resource.id,
          spaceId: OTHER_SPACE_ID,
          document: toJsonValue(resource.document),
        });
      }
      await orm.public.Space.create({
        id: RACE_CHILD_SPACE_ID,
        document: toJsonValue(raceChild.document),
        revision: '0',
      });
      await orm.public.RepositoryState.create({ singletonId: 1, metaSpaceId: OTHER_SPACE_ID });
    });
    await lockHeld.promise;

    // Two changes -- an ordinary single-Space update takes the
    // topology-preserving fast path, which never reaches `lockMetaIdentity` at
    // all. Both retitle only, keeping the Space Resource link intact, so the
    // candidate this proposes stays valid exactly when it is judged against
    // the identity the concurrent replacement actually established.
    const racing = repository.commit({
      changes: [
        {
          kind: 'update',
          spaceId: OTHER_SPACE_ID,
          snapshot: {
            ...linkedOther,
            document: { ...linkedOther.document, title: 'Retitled after race' },
          },
          expectedRevision: 0n,
        },
        {
          kind: 'update',
          spaceId: RACE_CHILD_SPACE_ID,
          snapshot: { ...raceChild, document: { ...raceChild.document, title: 'Retitled child' } },
          expectedRevision: 0n,
        },
      ],
    });
    await new Promise((resolve) => setTimeout(resolve, 250));
    releaseLock.resolve(undefined);
    await blocker;

    expectPersisted(await racing).toMatchObject({ kind: 'committed' });
    expectPersisted(await repository.loadSpace(OTHER_SPACE_ID)).toMatchObject({
      revision: 1n,
      snapshot: { document: { title: 'Retitled after race' } },
    });
  });

  /*
   * M13 (second review pass of the one-SQL-repository branch): `Space.relock`
   * (`src/persistence/sql-store.ts`) writes a placeholder `{}` document to
   * take a row's write lock during `replaceAggregate`'s per-row re-lock loop,
   * rather than round-tripping the row's real one. `#replaceUnserialised`'s
   * own doc comment says that is safe because every relocked row is either
   * truncated in the same transaction (`#replaceAllSpaces` -> `#truncate
   * HyperContent`, which deletes every currently stored row, relocked or not)
   * or the whole transaction rolls back on a `StaleSpaceRevisionError` -- but
   * nothing had held the rollback half. `SPACE_ID` sorts before `OTHER_
   * SPACE_ID`, so `loadAllForReplacement`'s ascending order relocks `SPACE_ID`
   * first; this forces the second row, `OTHER_SPACE_ID`, to conflict only
   * after `SPACE_ID`'s own placeholder write has already landed inside the
   * same (still-open) transaction, then proves that placeholder never
   * survives the rollback the conflict causes.
   */
  it("rolls back an earlier row's relock placeholder when a later row in the same replacement conflicts", async () => {
    await seed(SPACE_ID, [linkedSnapshot, otherSnapshot]);

    const lockHeld = Promise.withResolvers<undefined>();
    const releaseLock = Promise.withResolvers<undefined>();
    const blocker = db.transaction(async ({ orm }) => {
      // Take OTHER_SPACE_ID's row lock exactly where the racing replacement's
      // own relock loop would reach it second, so that call's relock of
      // SPACE_ID (first in id order) is forced to land, inside its own
      // still-open transaction, before this transaction retires OTHER_SPACE_
      // ID's revision out from under the racing call's lock-free read of it.
      await orm.public.Space.where({ id: OTHER_SPACE_ID }).update({ revision: '0' });
      lockHeld.resolve(undefined);
      await releaseLock.promise;
      // What the held lock stands in for: OTHER_SPACE_ID moves to a revision
      // the racing replacement's own `loadAllForReplacement` read did not see.
      await orm.public.Space.where({ id: OTHER_SPACE_ID }).update({ revision: '1' });
    });
    await lockHeld.promise;

    const racing = repository.replaceAggregate(
      { metaSpaceId: SPACE_ID, spaces: [snapshot] },
      SPACE_ID,
    );
    await new Promise((resolve) => setTimeout(resolve, 250));
    releaseLock.resolve(undefined);
    await blocker;

    await expect(racing).resolves.toMatchObject({ kind: 'conflict' });
    // SPACE_ID's row was relocked -- its placeholder document written -- before
    // OTHER_SPACE_ID's conflict rolled the whole transaction back. If the
    // rollback had not reverted that write, this would read back `{}` rather
    // than the Space `linkedSnapshot` itself stored.
    await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual({
      snapshot: linkedSnapshot,
      revision: 0n,
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
        // `revision` is TEXT now (ADR 0095), so the literal needs no relabelling
        // here — unlike the domain's `bigint`, which the codec encodes.
        revision: '1',
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

    expectPersisted(await committing).toMatchObject({ kind: 'conflict' });
    // The writer that did commit is the one still standing.
    expectPersisted(await repository.loadSpace(SPACE_ID)).toMatchObject({
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
        // `revision` is TEXT now (ADR 0095), so the literal needs no relabelling
        // here — unlike the domain's `bigint`, which the codec encodes.
        revision: '1',
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
              resources: otherSnapshot.resources,
            },
            revision: 1n,
            exportedRevision: null,
          },
        },
      ],
    });
    // The whole commit rolls back, so the Space the loop had already written is
    // left at the revision the losing commit never advanced past.
    expectPersisted(await repository.loadSpace(SPACE_ID)).toMatchObject({ revision: 0n });
  });

  it('serializes concurrent topology commits so the loser observes the complete winner', async () => {
    await seed(SPACE_ID, [snapshot]);
    const firstRepository = new SqlSpaceRepository(postgresSqlStore(db));
    const secondRepository = new SqlSpaceRepository(postgresSqlStore(db));
    const firstTarget: SpaceSnapshot = {
      id: OTHER_SPACE_ID,
      document: {
        version: 1,
        title: 'First target',
        defaultMap: OTHER_SPACE_MAP_ID,
        maps: [
          {
            id: OTHER_SPACE_MAP_ID,
            title: 'Map 1',
            kind: 'positioned',
            positions: {},
            graphs: [{ id: OTHER_SPACE_GRAPH_ID, title: 'Graph 1', edges: [] }],
            activeGraph: OTHER_SPACE_GRAPH_ID,
          },
        ],
      },
      resources: [],
    };
    const secondTarget: SpaceSnapshot = {
      id: CONCURRENT_SPACE_ID,
      document: {
        version: 1,
        title: 'Second target',
        defaultMap: CONCURRENT_MAP_ID,
        maps: [
          {
            id: CONCURRENT_MAP_ID,
            title: 'Map 1',
            kind: 'positioned',
            positions: {},
            graphs: [{ id: CONCURRENT_GRAPH_ID, title: 'Graph 1', edges: [] }],
            activeGraph: CONCURRENT_GRAPH_ID,
          },
        ],
      },
      resources: [],
    };
    const firstLinked: SpaceSnapshot = {
      ...snapshot,
      resources: [
        ...snapshot.resources,
        {
          id: MISSING_RESOURCE_ID,
          document: {
            title: 'First link',
            kind: 'space',
            spaceId: OTHER_SPACE_ID,
            map: OTHER_SPACE_MAP_ID,
            graph: OTHER_SPACE_GRAPH_ID,
          },
        },
      ],
    };
    const secondLinked: SpaceSnapshot = {
      ...snapshot,
      resources: [
        ...snapshot.resources,
        {
          id: UNRESOLVED_RESOURCE_ID,
          document: {
            title: 'Second link',
            kind: 'space',
            spaceId: CONCURRENT_SPACE_ID,
            map: CONCURRENT_MAP_ID,
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
});
