import { uuidSchema, type SpaceSnapshot, type UUID } from '@project/core';
import { HttpSpaceBackend } from '@project/http';
import {
  decodeLoadedSpace,
  decodeProblemDetails,
  encodeCommitRequest,
  problemCatalogue,
  type SpaceCommit,
} from '@project/persistence';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/http/sqlite-http-runtime';
import { openSqliteRepository } from '../support/sqlite-harness';
import {
  holdLockInSecondProcess,
  isBusyOrLocked,
  type HeldLock,
  type SecondProcessLock,
} from '../support/sqlite-second-process';

/*
 * Ticket 18. One Hyper process owns a SQLite file. Inside it, overlapping
 * repository operations are serialised (ticket 16), so they answer in domain
 * terms and never wait on SQLite. A second process on the same live file is
 * unsupported, and what it causes is an operational failure — thrown, never a
 * revision conflict — that leaves the file as it was.
 */

const META_ID = uuidSchema.parse('f0000000-0000-4000-8000-000000000001');
const CHILD_ID = uuidSchema.parse('f0000000-0000-4000-8000-000000000002');
const REPLACEMENT_META_ID = uuidSchema.parse('f0000000-0000-4000-8000-000000000003');
const META_RESOURCE_ID = uuidSchema.parse('f0000000-0000-4000-8000-000000000010');
const CHILD_RESOURCE_ID = uuidSchema.parse('f0000000-0000-4000-8000-000000000011');
const LINK_RESOURCE_ID = uuidSchema.parse('f0000000-0000-4000-8000-000000000012');
const CONTESTED_RESOURCE_ID = uuidSchema.parse('f0000000-0000-4000-8000-000000000013');
const REPLACEMENT_RESOURCE_ID = uuidSchema.parse('f0000000-0000-4000-8000-000000000014');
const MAP_ID = uuidSchema.parse('f0000000-0000-4000-8000-000000000020');
const GRAPH_ID = uuidSchema.parse('f0000000-0000-4000-8000-000000000021');
const NEW_CHILD_ID = uuidSchema.parse('f0000000-0000-4000-8000-000000000004');
const NEW_CHILD_RESOURCE_ID = uuidSchema.parse('f0000000-0000-4000-8000-000000000017');
const NEW_CHILD_MAP_ID = uuidSchema.parse('f0000000-0000-4000-8000-000000000022');
const NEW_CHILD_GRAPH_ID = uuidSchema.parse('f0000000-0000-4000-8000-000000000023');
const LINK_A_RESOURCE_ID = uuidSchema.parse('f0000000-0000-4000-8000-000000000015');
const LINK_B_RESOURCE_ID = uuidSchema.parse('f0000000-0000-4000-8000-000000000016');

/** The driver's hard-coded `PRAGMA busy_timeout` (`@prisma-next/driver-sqlite`). */
const BUSY_TIMEOUT_MS = 5_000;
const WELL_UNDER_BUSY_TIMEOUT_MS = 1_000;
/** Generous for a loaded CI runner; what matters is that it is bounded. */
const EXHAUSTED_WAIT_CEILING_MS = BUSY_TIMEOUT_MS + 2_500;
/** How early a second process that releases on its own clock may be observed to. */
const RELEASE_CLOCK_TOLERANCE_MS = 100;

const markdown = (id: UUID, title: string) => ({
  id,
  document: { title, kind: 'markdown' as const, body: title },
});

const child: SpaceSnapshot = {
  id: CHILD_ID,
  document: {
    version: 1,
    title: 'Child',
    defaultMap: MAP_ID,
    maps: [
      {
        id: MAP_ID,
        title: 'Map 1',
        kind: 'positioned',
        positions: {},
        graphs: [{ id: GRAPH_ID, title: 'Graph 1', edges: [] }],
        activeGraph: GRAPH_ID,
      },
    ],
  },
  resources: [markdown(CHILD_RESOURCE_ID, 'Child resource')],
};

const meta: SpaceSnapshot = {
  id: META_ID,
  document: { version: 1, title: 'Meta' },
  resources: [
    markdown(META_RESOURCE_ID, 'Meta resource'),
    {
      id: LINK_RESOURCE_ID,
      document: {
        title: 'Open child',
        kind: 'space',
        spaceId: CHILD_ID,
        map: MAP_ID,
        graph: GRAPH_ID,
      },
    },
  ],
};

const replacement = {
  metaSpaceId: REPLACEMENT_META_ID,
  spaces: [
    {
      id: REPLACEMENT_META_ID,
      document: { version: 1 as const, title: 'Replacement' },
      resources: [markdown(REPLACEMENT_RESOURCE_ID, 'Replacement resource')],
    },
  ],
};

const retitled = (snapshot: SpaceSnapshot, title: string): SpaceSnapshot => ({
  ...snapshot,
  document: { ...snapshot.document, title },
});

const withResource = (snapshot: SpaceSnapshot, id: UUID): SpaceSnapshot => ({
  ...snapshot,
  resources: [...snapshot.resources, markdown(id, 'Contested')],
});

const update = (snapshot: SpaceSnapshot, expectedRevision = 0n): SpaceCommit => ({
  changes: [{ kind: 'update', spaceId: snapshot.id, snapshot, expectedRevision }],
});

/**
 * A brand new Space, entirely disjoint from `meta`/`child`, that a racing
 * `create` change set would also need to link from Meta to be valid.
 */
const newChildSnapshot = (title: string): SpaceSnapshot => ({
  id: NEW_CHILD_ID,
  document: {
    version: 1,
    title,
    defaultMap: NEW_CHILD_MAP_ID,
    maps: [
      {
        id: NEW_CHILD_MAP_ID,
        title: 'Map 1',
        kind: 'positioned',
        positions: {},
        graphs: [{ id: NEW_CHILD_GRAPH_ID, title: 'Graph 1', edges: [] }],
        activeGraph: NEW_CHILD_GRAPH_ID,
      },
    ],
  },
  resources: [markdown(NEW_CHILD_RESOURCE_ID, 'New child resource')],
});

const metaLinkingNewChild = (linkResourceId: UUID): SpaceSnapshot => ({
  ...meta,
  resources: [
    ...meta.resources,
    {
      id: linkResourceId,
      document: {
        title: 'Open new child',
        kind: 'space' as const,
        spaceId: NEW_CHILD_ID,
        map: NEW_CHILD_MAP_ID,
        graph: NEW_CHILD_GRAPH_ID,
      },
    },
  ],
});

/**
 * A valid `create` of a brand new Space id, paired with the Meta update that
 * links it — a create can never be valid alone, since nothing yet refers to
 * the new Space (ADR 0079's `ordinary-space-unreferenced`).
 */
const createNewChild = (linkResourceId: UUID, title: string): SpaceCommit => ({
  changes: [
    { kind: 'create', spaceId: NEW_CHILD_ID, snapshot: newChildSnapshot(title) },
    {
      kind: 'update',
      spaceId: META_ID,
      snapshot: metaLinkingNewChild(linkResourceId),
      expectedRevision: 0n,
    },
  ],
});

const timed = async <T>(operation: () => T | Promise<T>) => {
  const started = performance.now();
  const settled = await Promise.allSettled([operation()]);
  return { settled: settled[0], elapsed: performance.now() - started };
};

describe('SQLite contention', () => {
  let close: (() => Promise<void>) | undefined;
  let held: HeldLock | undefined;

  afterEach(async () => {
    await held?.release();
    held = undefined;
    await close?.();
    close = undefined;
  });

  const initialized = async () => {
    const harness = await openSqliteRepository();
    close = harness.close;
    await expect(
      harness.repository.initializeAggregate({ metaSpaceId: META_ID, spaces: [meta, child] }),
    ).resolves.toMatchObject({ kind: 'initialized' });
    return harness;
  };

  describe('inside one process', () => {
    // The different-Space case is `serialises overlapping in-process commits at
    // different Spaces well under the busy timeout` in
    // `sqlite-space-repository.test.ts`.

    it('answers the loser of a same-Space race as a conflict and writes nothing of it', async () => {
      const { repository } = await initialized();

      const { settled, elapsed } = await timed(() =>
        Promise.all([
          repository.commit(update(retitled(meta, 'First'))),
          repository.commit(update(retitled(meta, 'Second'))),
        ]),
      );

      expect(elapsed).toBeLessThan(WELL_UNDER_BUSY_TIMEOUT_MS);
      expect(settled).toMatchObject({
        status: 'fulfilled',
        value: [{ kind: 'committed' }, { kind: 'conflict', conflicts: [{ spaceId: META_ID }] }],
      });
      await expect(repository.loadSpace(META_ID)).resolves.toMatchObject({
        snapshot: { document: { title: 'First' } },
        revision: 1n,
      });
    });

    // The loser's complete aggregate intake sees the winner's Resource already
    // stored, so it is refused in domain terms before any write is attempted.
    it('refuses the loser of a Resource identity race and writes nothing of it', async () => {
      const { repository } = await initialized();

      const { settled, elapsed } = await timed(() =>
        Promise.all([
          repository.commit(update(withResource(meta, CONTESTED_RESOURCE_ID))),
          repository.commit(update(withResource(child, CONTESTED_RESOURCE_ID))),
        ]),
      );

      expect(elapsed).toBeLessThan(WELL_UNDER_BUSY_TIMEOUT_MS);
      expect(settled).toMatchObject({
        status: 'fulfilled',
        value: [{ kind: 'committed' }, { kind: 'aggregate-refused' }],
      });
      await expect(repository.loadSpace(CHILD_ID)).resolves.toEqual({
        snapshot: child,
        revision: 0n,
        exportedRevision: null,
      });
    });

    /*
     * A `create` of a brand new Space id can never stand alone — the create
     * needs a Meta update that links it, or ADR 0079's
     * `ordinary-space-unreferenced` refuses it. So two overlapping change
     * sets that each create the *same* new Space id also each carry a Meta
     * update at the Meta revision they both last saw. Serialisation (ticket
     * 16) means the loser's read happens after the winner has already
     * written, so by the time `decideAggregateCommit` loops over the loser's
     * changes, both are stale: Meta's revision moved, and the create's
     * target Space id now already exists. The loop collects every stale
     * change rather than stopping at the first one, so the loser's answer
     * names both — not Meta alone.
     */
    it('conflicts the loser of a same-id create race on both the new Space and Meta, and writes nothing of it', async () => {
      const { repository } = await initialized();

      const { settled, elapsed } = await timed(() =>
        Promise.all([
          repository.commit(createNewChild(LINK_A_RESOURCE_ID, 'From A')),
          repository.commit(createNewChild(LINK_B_RESOURCE_ID, 'From B')),
        ]),
      );

      expect(elapsed).toBeLessThan(WELL_UNDER_BUSY_TIMEOUT_MS);
      expect(settled).toMatchObject({
        status: 'fulfilled',
        value: [
          { kind: 'committed' },
          {
            kind: 'conflict',
            conflicts: [{ spaceId: NEW_CHILD_ID }, { spaceId: META_ID }],
          },
        ],
      });
      await expect(repository.loadSpace(NEW_CHILD_ID)).resolves.toMatchObject({
        snapshot: { document: { title: 'From A' } },
        revision: 0n,
      });
    });

    it('settles a replacement racing a commit in arrival order, commit first', async () => {
      const { repository } = await initialized();

      const { settled, elapsed } = await timed(() =>
        Promise.all([
          repository.commit(update(retitled(meta, 'Edited'))),
          repository.replaceAggregate(replacement, META_ID),
        ]),
      );

      expect(elapsed).toBeLessThan(WELL_UNDER_BUSY_TIMEOUT_MS);
      expect(settled).toMatchObject({
        status: 'fulfilled',
        value: [{ kind: 'committed' }, { kind: 'replaced' }],
      });
      await expect(repository.loadAggregate()).resolves.toMatchObject({
        kind: 'loaded',
        aggregate: { metaSpaceId: REPLACEMENT_META_ID, spaces: [{ revision: 0n }] },
      });
    });

    it('settles a replacement racing a commit in arrival order, replacement first', async () => {
      const { repository } = await initialized();

      const { settled, elapsed } = await timed(() =>
        Promise.all([
          repository.replaceAggregate(replacement, META_ID),
          repository.commit(update(retitled(meta, 'Edited'))),
        ]),
      );

      expect(elapsed).toBeLessThan(WELL_UNDER_BUSY_TIMEOUT_MS);
      expect(settled).toMatchObject({
        status: 'fulfilled',
        value: [
          { kind: 'replaced' },
          { kind: 'conflict', conflicts: [{ spaceId: META_ID, current: undefined }] },
        ],
      });
      await expect(repository.loadAggregate()).resolves.toMatchObject({
        kind: 'loaded',
        aggregate: { metaSpaceId: REPLACEMENT_META_ID, spaces: [{ revision: 0n }] },
      });
    });
  });

  describe('with a second process on the live file', () => {
    /*
     * Measured, not carried over from ticket 14's in-process numbers. Which
     * wait a lock produces is SQLite's: a reader in another process lets this
     * one write, then holds its COMMIT until the busy timeout runs out; a
     * writer before its commit refuses this one's write at once; a writer
     * committing refuses every statement after the full timeout.
     */
    const BUSY_MATRIX: readonly {
      readonly lock: SecondProcessLock;
      readonly operation: 'commit' | 'replaceAggregate' | 'loadSpace';
      readonly wait: 'immediate' | 'exhausted';
    }[] = [
      { lock: 'shared', operation: 'commit', wait: 'exhausted' },
      { lock: 'shared', operation: 'replaceAggregate', wait: 'exhausted' },
      { lock: 'reserved', operation: 'commit', wait: 'immediate' },
      { lock: 'reserved', operation: 'replaceAggregate', wait: 'immediate' },
      { lock: 'exclusive', operation: 'commit', wait: 'exhausted' },
      { lock: 'exclusive', operation: 'loadSpace', wait: 'exhausted' },
    ];

    // Neither of the locks a writer can hold short of committing stops a read.
    for (const lock of ['shared', 'reserved'] as const) {
      it(`serves loadSpace beside a ${lock} lock without waiting`, async () => {
        const { path, repository } = await initialized();
        held = await holdLockInSecondProcess(path, lock);

        const { settled, elapsed } = await timed(() => repository.loadSpace(META_ID));

        expect(settled).toMatchObject({ status: 'fulfilled', value: { revision: 0n } });
        expect(elapsed).toBeLessThan(WELL_UNDER_BUSY_TIMEOUT_MS);
      });
    }

    for (const { lock, operation, wait } of BUSY_MATRIX) {
      it(`fails ${operation} against a ${lock} lock as ${wait} BUSY, leaving the file unchanged and unlocked`, async () => {
        const { path, repository } = await initialized();
        const before = await repository.loadAggregate();
        held = await holdLockInSecondProcess(path, lock);

        const { settled, elapsed } = await timed(async () => {
          if (operation === 'commit')
            await repository.commit(update(retitled(meta, 'Never stored')));
          else if (operation === 'replaceAggregate') {
            await repository.replaceAggregate(replacement, META_ID);
          } else await repository.loadSpace(META_ID);
        });

        expect(settled.status).toBe('rejected');
        expect(settled.status === 'rejected' && isBusyOrLocked(settled.reason)).toBe(true);
        if (wait === 'immediate') expect(elapsed).toBeLessThan(WELL_UNDER_BUSY_TIMEOUT_MS);
        else {
          expect(elapsed).toBeGreaterThanOrEqual(BUSY_TIMEOUT_MS);
          expect(elapsed).toBeLessThan(EXHAUSTED_WAIT_CEILING_MS);
        }

        await held.release();
        held = undefined;
        await expect(repository.loadAggregate()).resolves.toEqual(before);
        await expect(repository.commit(update(retitled(meta, 'Recovered')))).resolves.toMatchObject(
          { kind: 'committed' },
        );
      });
    }

    it('waits out a second process that lets go inside the busy timeout, then commits', async () => {
      const { path, repository } = await initialized();
      const releaseAfterMs = 1_000;
      held = await holdLockInSecondProcess(path, 'exclusive', releaseAfterMs);

      const { settled, elapsed } = await timed(() =>
        repository.commit(update(retitled(meta, 'Waited'))),
      );

      expect(settled).toMatchObject({ status: 'fulfilled', value: { kind: 'committed' } });
      expect(elapsed).toBeGreaterThanOrEqual(releaseAfterMs - RELEASE_CLOCK_TOLERANCE_MS);
      expect(elapsed).toBeLessThan(BUSY_TIMEOUT_MS);
    });

    it('answers HTTP as retryable 503 persistence-unavailable inside the client timeout, never 409', async () => {
      const harness = await initialized();
      const application = await createApp({
        database: harness.database,
        wait: () => new Promise<void>(() => undefined),
      });
      const loaded = await application.fetch(
        new Request(`http://hyper.test/api/spaces/${META_ID}`),
      );
      const body = decodeLoadedSpace(
        // SAFETY: JSON.parse is the HTTP body boundary; decodeLoadedSpace parses next.
        JSON.parse(await loaded.text()) as unknown,
      );
      const commit = update(retitled(body.snapshot, 'Never stored'), body.revision);
      const post = () =>
        application.fetch(
          new Request('http://hyper.test/api/spaces', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(encodeCommitRequest(commit)),
          }),
        );
      held = await holdLockInSecondProcess(harness.path, 'exclusive');

      for (const request of [
        post,
        () => application.fetch(new Request(`http://hyper.test/api/spaces/${META_ID}`)),
      ]) {
        const { settled, elapsed } = await timed(request);
        if (settled.status === 'rejected') throw settled.reason;
        const response = settled.value;
        expect(response.status).toBe(503);
        const problem = decodeProblemDetails(
          // SAFETY: JSON.parse is the HTTP body boundary; decodeProblemDetails parses next.
          JSON.parse(await response.text()) as unknown,
        );
        expect(problem.type).toBe(problemCatalogue['persistence-unavailable'].type);
        // The exhausted wait is the longest a BUSY answer takes, and the
        // client has to still be listening when it arrives: the ceiling sits
        // 2.5s inside `HttpSpaceBackend`'s default 10s request timeout
        // (`packages/http/src/backend.ts`).
        expect(elapsed).toBeLessThan(EXHAUSTED_WAIT_CEILING_MS);
      }

      const backend = new HttpSpaceBackend('http://hyper.test', {
        fetch: (input, init) => Promise.resolve(application.fetch(new Request(input, init))),
      });
      await expect(backend.commit(commit)).resolves.toMatchObject({
        kind: 'retryable-failure',
        code: 'unavailable',
      });

      await held.release();
      held = undefined;
      await expect(harness.repository.commit(commit)).resolves.toMatchObject({ kind: 'committed' });
      await expect(harness.repository.loadSpace(META_ID)).resolves.toMatchObject({
        snapshot: { document: { title: 'Never stored' } },
        revision: body.revision + 1n,
      });
    });
  });
});
