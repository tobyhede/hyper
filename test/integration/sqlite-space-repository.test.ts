import { uuidSchema, type SpaceSnapshot, type UUID } from '@project/core';
import {
  AggregateInvariantError,
  classifyStoredFailure,
  PersistenceUnavailableError,
} from '@project/persistence';
import { afterEach, describe, expect, it } from 'vitest';
import { SqlSpaceRepository } from '../../src/persistence/sql-space-repository';
import type { SpaceRepository } from '../../src/persistence/space-repository';
import type { SqlTables } from '../../src/persistence/sql-store';
import type { SqliteDatabase } from '../../src/sqlite/db';
import { sqliteSqlStore } from '../../src/sqlite/sql-store';
import { retryMetaSpaceEstablishment } from '../../src/startup/database-startup';
import { captureError } from '../support/capture-error';
import { spaceRepositoryContract } from '../support/repository-contract';
import { openSqliteRepository } from '../support/sqlite-harness';

// Ticket 24: `SqlSpaceRepository` now owns `commit` too, so the whole
// contract -- lifecycle and commit alike -- runs directly against it; the
// ticket 22/23 tracer and lifecycle-only wiring this block used to carry
// beside it are gone, superseded by this one call covering everything they
// each covered separately.
spaceRepositoryContract('SqlSpaceRepository (SQLite)', async () => {
  const harness = await openSqliteRepository();
  return {
    repository: harness.repository,
    close: harness.close,
    reopenRepository: harness.reopenRepository,
    arrangeBrokenState: async (kind, ids) => {
      if (kind === 'invalid-space-document') {
        await harness.database.orm.Space.create({
          id: ids.spaceId,
          document: { version: 1 },
          revision: '0',
        });
        await harness.database.orm.RepositoryState.create({
          singletonId: 1,
          metaSpaceId: ids.spaceId,
        });
        return { expectedMetaSpaceId: ids.spaceId };
      }
      await harness.database.orm.Space.create({
        id: ids.spaceId,
        document: { version: 1, title: 'Meta' },
        revision: '0',
      });
      await harness.database.orm.Space.create({
        id: ids.otherSpaceId,
        document: { version: 1, title: 'Unreferenced' },
        revision: '0',
      });
      await harness.database.orm.RepositoryState.create({
        singletonId: 1,
        metaSpaceId: ids.spaceId,
      });
      return { expectedMetaSpaceId: ids.spaceId };
    },
    removeMetaIdentity: async () => {
      await harness.database.orm.RepositoryState.where({ singletonId: 1 }).delete();
    },
    writeRawRevision: async ({ spaceId, revision, exportedRevision }) => {
      if (exportedRevision === undefined) {
        await harness.database.orm.Space.where({ id: spaceId }).update({ revision });
        return;
      }
      await harness.database.orm.Space.where({ id: spaceId }).update({
        revision,
        exportedRevision,
      });
    },
  };
});

const SPACE_ID = uuidSchema.parse('c0000000-0000-4000-8000-000000000001');
const OTHER_SPACE_ID = uuidSchema.parse('c0000000-0000-4000-8000-000000000002');
const MISSING_SPACE_ID = uuidSchema.parse('c0000000-0000-4000-8000-000000000003');
const RESOURCE_ID = uuidSchema.parse('c0000000-0000-4000-8000-000000000010');
const SECOND_RESOURCE_ID = uuidSchema.parse('c0000000-0000-4000-8000-000000000011');
const OTHER_RESOURCE_ID = uuidSchema.parse('c0000000-0000-4000-8000-000000000012');
const GRAPH_ID = uuidSchema.parse('c0000000-0000-4000-8000-000000000020');
const MAP_ID = uuidSchema.parse('c0000000-0000-4000-8000-000000000021');
const LINK_RESOURCE_ID = uuidSchema.parse('c0000000-0000-4000-8000-000000000013');

const resource = (id: UUID, title: string) => ({
  id,
  document: { title, kind: 'markdown' as const, body: title },
});

const space = (id: UUID, title: string, resourceIds: readonly UUID[]): SpaceSnapshot => ({
  id,
  document: { version: 1, title },
  resources: resourceIds.map((resourceId) => resource(resourceId, `${title} resource`)),
});

const spaceResource = (
  id: UUID,
  target: UUID,
  selection: { readonly map: UUID; readonly graph: UUID },
) => ({
  id,
  document: { title: `Open ${target}`, kind: 'space' as const, spaceId: target, ...selection },
});

const targetSpace = (id: UUID, title: string, resourceIds: readonly UUID[]): SpaceSnapshot => ({
  ...space(id, title, resourceIds),
  document: {
    version: 1,
    title,
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
});

const retitled = (snapshot: SpaceSnapshot, title: string): SpaceSnapshot => ({
  ...snapshot,
  document: { ...snapshot.document, title },
});

type RepositoryStateTable = SqlTables<unknown>['RepositoryState'];

const stored = (snapshot: SpaceSnapshot, revision: bigint, exportedRevision: bigint | null) => ({
  snapshot,
  revision,
  exportedRevision,
});

describe('SqlSpaceRepository (SQLite) — commit and lifecycle edge cases', () => {
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await close?.();
    close = undefined;
  });

  const opened = async () => {
    const harness = await openSqliteRepository();
    close = harness.close;
    return harness;
  };

  const WELL_UNDER_BUSY_TIMEOUT_MS = 1_000;

  it('serves two overlapping aggregate reads through one client without waiting on each other', async () => {
    const { repository } = await opened();
    const first = space(SPACE_ID, 'One', [RESOURCE_ID]);
    await repository.initializeAggregate({ metaSpaceId: SPACE_ID, spaces: [first] });
    const loaded = {
      kind: 'loaded',
      aggregate: { metaSpaceId: SPACE_ID, spaces: [stored(first, 0n, null)] },
    };

    const started = performance.now();
    const results = await Promise.allSettled([
      repository.loadAggregate(),
      repository.loadAggregate(),
    ]);
    const elapsed = performance.now() - started;

    expect(results).toEqual([
      { status: 'fulfilled', value: loaded },
      { status: 'fulfilled', value: loaded },
    ]);
    expect(elapsed).toBeLessThan(WELL_UNDER_BUSY_TIMEOUT_MS);
  });

  it('settles two overlapping first initializations through one client as initialized and existing', async () => {
    const { repository } = await opened();
    const first = space(SPACE_ID, 'One', [RESOURCE_ID]);

    const started = performance.now();
    const results = await Promise.allSettled([
      repository.initializeAggregate({ metaSpaceId: SPACE_ID, spaces: [first] }),
      repository.initializeAggregate({ metaSpaceId: SPACE_ID, spaces: [structuredClone(first)] }),
    ]);
    const elapsed = performance.now() - started;

    expect(results.every((result) => result.status === 'fulfilled')).toBe(true);
    expect(
      results.flatMap((result) => (result.status === 'fulfilled' ? [result.value.kind] : [])),
    ).toEqual(expect.arrayContaining(['initialized', 'existing']));
    expect(elapsed).toBeLessThan(WELL_UNDER_BUSY_TIMEOUT_MS);
    await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual(stored(first, 0n, null));
  });

  // ADR 0095: the serialise queue orders every repository operation in the
  // process, over one file handle — not one queue per `SqlSpaceRepository`
  // instance. Two repositories built over the same `SqliteDatabase` (as the
  // HTTP runtime and `test/support/sqlite-harness.ts` each do) share it.
  // Without that, this same shape — two overlapping first initializations —
  // opens two SQLite connections that genuinely contend, and either surfaces
  // as `database is locked` or waits out a meaningful slice of the 5000ms
  // busy timeout; sharing the queue keeps them from ever overlapping at the
  // driver, the same way one instance calling `initializeAggregate` twice
  // does above.
  it('serialises overlapping operations across two repositories over one file handle', async () => {
    const { database } = await opened();
    const first = space(SPACE_ID, 'One', [RESOURCE_ID]);
    const repositoryA = new SqlSpaceRepository(sqliteSqlStore(database));
    const repositoryB = new SqlSpaceRepository(sqliteSqlStore(database));

    const started = performance.now();
    const results = await Promise.allSettled([
      repositoryA.initializeAggregate({ metaSpaceId: SPACE_ID, spaces: [first] }),
      repositoryB.initializeAggregate({ metaSpaceId: SPACE_ID, spaces: [structuredClone(first)] }),
    ]);
    const elapsed = performance.now() - started;

    expect(results.every((result) => result.status === 'fulfilled')).toBe(true);
    expect(
      results.flatMap((result) => (result.status === 'fulfilled' ? [result.value.kind] : [])),
    ).toEqual(expect.arrayContaining(['initialized', 'existing']));
    expect(elapsed).toBeLessThan(WELL_UNDER_BUSY_TIMEOUT_MS);
    await expect(repositoryA.loadSpace(SPACE_ID)).resolves.toEqual(stored(first, 0n, null));
  });

  // Moved to `repository-contract.ts` (ticket 22): "stores and commits a
  // revision above Number.MAX_SAFE_INTEGER as canonical decimal text" proves
  // this same round trip on both databases now that PostgreSQL's `revision`
  // is TEXT too.

  it('serialises overlapping in-process commits at different Spaces well under the busy timeout', async () => {
    const { repository } = await opened();
    const child = targetSpace(OTHER_SPACE_ID, 'Child', [OTHER_RESOURCE_ID]);
    const meta = {
      ...space(SPACE_ID, 'Meta', [RESOURCE_ID]),
      resources: [
        resource(RESOURCE_ID, 'Meta resource'),
        spaceResource(LINK_RESOURCE_ID, OTHER_SPACE_ID, { map: MAP_ID, graph: GRAPH_ID }),
      ],
    };
    await repository.initializeAggregate({ metaSpaceId: SPACE_ID, spaces: [meta, child] });

    const started = Date.now();
    const results = await Promise.all([
      repository.commit({
        changes: [
          {
            kind: 'update',
            spaceId: SPACE_ID,
            snapshot: retitled(meta, 'Meta edited'),
            expectedRevision: 0n,
          },
        ],
      }),
      repository.commit({
        changes: [
          {
            kind: 'update',
            spaceId: OTHER_SPACE_ID,
            snapshot: retitled(child, 'Child edited'),
            expectedRevision: 0n,
          },
        ],
      }),
    ]);
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(results.map(({ kind }) => kind).sort()).toEqual(['committed', 'committed']);
    await expect(repository.loadSpace(SPACE_ID)).resolves.toMatchObject({
      snapshot: { document: { title: 'Meta edited' } },
      revision: 1n,
    });
    await expect(repository.loadSpace(OTHER_SPACE_ID)).resolves.toMatchObject({
      snapshot: { document: { title: 'Child edited' } },
      revision: 1n,
    });
  });

  /*
   * A read and a commit through one client are two SQLite handles on one file.
   * Both orderings, and both commit paths — the multi-Space one that locks the
   * Meta identity row and the topology-preserving one that does not. The store
   * holds enough Spaces that `listSpaces` yields between rows, so a read is
   * still holding its statement open when the commit reaches COMMIT.
   */
  const COMMIT_KINDS = ['multi-Space', 'topology-preserving'] as const;
  const ORDERINGS = ['commit first', 'reads first'] as const;
  const LINKED_SPACES = 300;
  const TURNS_BETWEEN_READS = 500;
  const linkedSpaceId = (index: number) =>
    uuidSchema.parse(`d0000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`);
  const linkResourceId = (index: number) =>
    uuidSchema.parse(`e0000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`);

  for (const commitKind of COMMIT_KINDS) {
    for (const ordering of ORDERINGS) {
      it(`serves loadSpace and listSpaces overlapping a ${commitKind} commit (${ordering}) well under the busy timeout`, async () => {
        const { repository } = await opened();
        const linkedSpaces = Array.from({ length: LINKED_SPACES }, (_, index) =>
          targetSpace(linkedSpaceId(index), `Linked ${index}`, []),
        );
        const meta: SpaceSnapshot = {
          ...space(SPACE_ID, 'Meta', [RESOURCE_ID, SECOND_RESOURCE_ID]),
          resources: [
            resource(RESOURCE_ID, 'Meta resource'),
            resource(SECOND_RESOURCE_ID, 'Second meta resource'),
            ...linkedSpaces.map(({ id }, index) =>
              spaceResource(linkResourceId(index), id, { map: MAP_ID, graph: GRAPH_ID }),
            ),
          ],
        };
        await expect(
          repository.initializeAggregate({
            metaSpaceId: SPACE_ID,
            spaces: [meta, ...linkedSpaces],
          }),
        ).resolves.toMatchObject({ kind: 'initialized' });
        const child = targetSpace(OTHER_SPACE_ID, 'Child', [OTHER_RESOURCE_ID]);
        const linked: SpaceSnapshot = {
          ...retitled(meta, 'Meta linked'),
          resources: [
            ...meta.resources,
            spaceResource(LINK_RESOURCE_ID, OTHER_SPACE_ID, { map: MAP_ID, graph: GRAPH_ID }),
          ],
        };
        const commit = () =>
          commitKind === 'multi-Space'
            ? repository.commit({
                changes: [
                  { kind: 'create', spaceId: OTHER_SPACE_ID, snapshot: child },
                  { kind: 'update', spaceId: SPACE_ID, snapshot: linked, expectedRevision: 0n },
                ],
              })
            : repository.commit({
                changes: [
                  {
                    kind: 'update',
                    spaceId: SPACE_ID,
                    snapshot: retitled(meta, 'Meta edited'),
                    expectedRevision: 0n,
                  },
                ],
              });
        const reads = () => [repository.loadSpace(SPACE_ID), repository.listSpaces()];

        const settled: Promise<unknown>[] = ordering === 'reads first' ? reads() : [];
        const started = performance.now();
        let commitElapsed: number | undefined;
        const committed = commit().finally(() => {
          commitElapsed = performance.now() - started;
        });
        // Keep reads arriving for as long as the commit is open. Every step of
        // either side is synchronous SQLite work between promise turns, so a
        // steady stream is what puts a read in the middle of its statement when
        // the commit reaches COMMIT.
        while (commitElapsed === undefined) {
          settled.push(...reads());
          for (let turn = 0; turn < TURNS_BETWEEN_READS; turn += 1) await Promise.resolve();
        }
        const results = await Promise.allSettled([committed, ...settled]);

        expect(results.filter(({ status }) => status === 'rejected')).toEqual([]);
        expect(results[0]).toMatchObject({ status: 'fulfilled', value: { kind: 'committed' } });
        expect(commitElapsed).toBeLessThan(WELL_UNDER_BUSY_TIMEOUT_MS);
        await expect(repository.loadSpace(SPACE_ID)).resolves.toMatchObject({ revision: 1n });
      });
    }
  }

  /*
   * Stored state that is not an aggregate cannot be written through either
   * lifecycle door, so these cases write rows directly. Reading and
   * initializing fail it as an invariant and leave it alone; replacement
   * truncates it (ADR 0094), still authorized by the Meta identity it read.
   */
  const proposed = space(SPACE_ID, 'Proposal', [RESOURCE_ID]);
  const proposal = { metaSpaceId: SPACE_ID, spaces: [proposed] };

  const expectReadAndInitializeRefuse = async (repository: SpaceRepository): Promise<void> => {
    await expect(repository.loadAggregate()).rejects.toThrow(AggregateInvariantError);
    await expect(repository.initializeAggregate(proposal)).rejects.toThrow(AggregateInvariantError);
  };

  const expectTruncatedTo = async (repository: SpaceRepository): Promise<void> => {
    await expect(repository.loadAggregate()).resolves.toEqual({
      kind: 'loaded',
      aggregate: { metaSpaceId: SPACE_ID, spaces: [stored(proposed, 0n, null)] },
    });
  };

  it('truncates a stored Space whose document is not JSON', async () => {
    const { path, repository } = await opened();
    // The ORM encodes `document` as JSON, so only a raw write can store text
    // that is not; the TEXT column carries no `json_valid` check to refuse it.
    const { DatabaseSync } = process.getBuiltinModule('node:sqlite');
    const connection = new DatabaseSync(path);
    try {
      connection
        .prepare("INSERT INTO spaces (id, document, updated_at) VALUES (?, ?, datetime('now'))")
        .run(OTHER_SPACE_ID, 'not json');
      connection
        .prepare('INSERT INTO repository_state (singleton_id, meta_space_id) VALUES (1, ?)')
        .run(OTHER_SPACE_ID);
    } finally {
      connection.close();
    }

    // Ticket 27: two raw-text statements on the transaction connection are what
    // let the adapter's own per-row decode step catch this and wrap it as
    // `AggregateInvariantError` — rather than the ORM's root-level json codec
    // throwing first, before any intake of ours runs. See
    // `.scratch/database-persistence/issues/27`.
    await expectReadAndInitializeRefuse(repository);
    await expect(repository.replaceAggregate(proposal, OTHER_SPACE_ID)).resolves.toMatchObject({
      kind: 'replaced',
    });
    await expectTruncatedTo(repository);
  });

  it('truncates a stored Space whose Resource document is not JSON', async () => {
    const { path, repository, database } = await opened();
    await database.orm.Space.create({
      id: OTHER_SPACE_ID,
      document: { version: 1, title: 'Orphan' },
      revision: '0',
    });
    // Only a raw write can store Resource text that is not JSON; the ORM encodes
    // `document` as JSON, same as for a Space's own document above.
    const { DatabaseSync } = process.getBuiltinModule('node:sqlite');
    const connection = new DatabaseSync(path);
    try {
      connection
        .prepare(
          "INSERT INTO resources (id, space_id, document, updated_at) VALUES (?, ?, ?, datetime('now'))",
        )
        .run(OTHER_RESOURCE_ID, OTHER_SPACE_ID, 'not json either');
      connection
        .prepare('INSERT INTO repository_state (singleton_id, meta_space_id) VALUES (1, ?)')
        .run(OTHER_SPACE_ID);
    } finally {
      connection.close();
    }

    await expectReadAndInitializeRefuse(repository);
    await expect(repository.replaceAggregate(proposal, OTHER_SPACE_ID)).resolves.toMatchObject({
      kind: 'replaced',
    });
    await expectTruncatedTo(repository);
  });

  it('refuses a Meta identity naming a Space the file does not store', async () => {
    const { repository, database } = await opened();

    await expect(
      database.orm.RepositoryState.create({ singletonId: 1, metaSpaceId: MISSING_SPACE_ID }),
    ).rejects.toThrow();
    await repository.initializeAggregate({
      metaSpaceId: SPACE_ID,
      spaces: [space(SPACE_ID, 'Meta', [])],
    });
    await expect(database.orm.Space.where({ id: SPACE_ID }).delete()).rejects.toThrow();
    await expect(repository.loadAggregate()).resolves.toMatchObject({
      kind: 'loaded',
      aggregate: { metaSpaceId: SPACE_ID },
    });
  });

  // Ticket 31: an unreachable database is named, not inferred from a failure
  // being something other than broken stored state. A client closed underneath
  // the repository refuses before any transaction opens, which is the position
  // the repository names unavailable by — whatever the driver's error says. The
  // driver's own error stays on `.cause`, where an operator's log finds it.
  it('names a database that will not open a transaction unavailable', async () => {
    const { repository, database } = await opened();
    const first = space(SPACE_ID, 'One', [RESOURCE_ID]);
    await repository.initializeAggregate({ metaSpaceId: SPACE_ID, spaces: [first] });
    await database.close();

    await expect(repository.loadAggregate()).rejects.toBeInstanceOf(PersistenceUnavailableError);
    await expect(
      repository.commit({
        changes: [
          {
            kind: 'update',
            spaceId: SPACE_ID,
            snapshot: { ...first, document: { ...first.document, title: 'Never stored' } },
            expectedRevision: 0n,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(PersistenceUnavailableError);
    const initializing = await captureError(() =>
      repository.initializeAggregate({ metaSpaceId: SPACE_ID, spaces: [first] }),
    );
    expect(initializing).toBeInstanceOf(PersistenceUnavailableError);
    expect(initializing?.cause).toMatchObject({ message: 'SQLite client is closed' });
  });

  /**
   * The harness's own store, with one `RepositoryState` member replaced. Both
   * stand-ins below reach the repository exactly where the real member's
   * result would, inside the transaction, after its callback has run -- so
   * what they exercise is the naming of a failure *past* `#transaction`'s
   * position rule, which is the only place these two defects live.
   */
  const withRepositoryState = (
    database: SqliteDatabase,
    replace: (state: RepositoryStateTable) => RepositoryStateTable,
  ) => {
    const store = sqliteSqlStore(database);
    const tables: typeof store.tables = (handle) => {
      const real = store.tables(handle);
      return { ...real, RepositoryState: replace(real.RepositoryState) };
    };
    return new SqlSpaceRepository({ ...store, tables });
  };

  /**
   * What `@prisma-next/driver-postgres`' `normalizePgError` makes of a
   * statement PostgreSQL failed with a SQLSTATE: `@prisma-next/sql-errors`'
   * `SqlQueryError`, the code on `sqlState`. Built by hand because that
   * package is the driver's dependency, not this repository's; SQLite never
   * raises one of these codes, which is why a SQLite file stands in for the
   * database here and only the failure is PostgreSQL's.
   */
  const queryError = (sqlState: string): Error =>
    Object.assign(new Error(`statement failed with ${sqlState}`), {
      kind: 'sql_query',
      sqlState,
    });

  // Ticket 31, amended. A deadlock victim is contention, not a defect: the
  // database chose this transaction to abort so the other could proceed, and
  // the same request is expected to succeed on a later attempt.
  it('names a statement PostgreSQL aborted for contention unavailable', async () => {
    const { repository, database } = await opened();
    await repository.initializeAggregate({
      metaSpaceId: SPACE_ID,
      spaces: [space(SPACE_ID, 'One', [RESOURCE_ID])],
    });
    const deadlock = queryError('40P01');
    const deadlocked = withRepositoryState(database, (state) => ({
      ...state,
      read: () => Promise.reject(deadlock),
    }));

    const error = await captureError(() => deadlocked.loadAggregate());

    expect(error).toBeInstanceOf(PersistenceUnavailableError);
    expect(error?.cause).toBe(deadlock);
  });

  it('leaves a statement failure that is a defect unclassified', async () => {
    const { repository, database } = await opened();
    await repository.initializeAggregate({
      metaSpaceId: SPACE_ID,
      spaces: [space(SPACE_ID, 'One', [RESOURCE_ID])],
    });
    const duplicate = queryError('23505');
    const failing = withRepositoryState(database, (state) => ({
      ...state,
      read: () => Promise.reject(duplicate),
    }));

    expect(classifyStoredFailure(await captureError(() => failing.loadAggregate()))).toBe(
      'unclassified',
    );
  });

  // Before the amendment the deadlock was unclassified, and two in a row made
  // start-up give up for good on what a third attempt cures.
  it('keeps start-up trying through contention', async () => {
    const { database } = await opened();
    let reads = 0;
    const contended = withRepositoryState(database, (state) => ({
      ...state,
      read: () => {
        reads += 1;
        return reads <= 3 ? Promise.reject(queryError('40001')) : state.read();
      },
    }));
    const ids = [SPACE_ID, RESOURCE_ID, MAP_ID, GRAPH_ID];

    const metaSpaceId = await retryMetaSpaceEstablishment(
      contended,
      () => {
        const id = ids.shift();
        if (id === undefined) throw new Error('Establishment minted more ids than it names');
        return id;
      },
      { wait: () => Promise.resolve(), report: () => undefined },
    );

    expect(metaSpaceId).toBe(SPACE_ID);
  });

  // A concurrent replacement deleting and rewriting the singleton row between
  // the read and the relock, twice running, is a race that has passed by the
  // next attempt -- not stored state that is broken, and not a defect.
  it('names a Meta identity that keeps moving while it is locked unavailable', async () => {
    const { repository, database } = await opened();
    await repository.initializeAggregate({
      metaSpaceId: SPACE_ID,
      spaces: [space(SPACE_ID, 'One', [RESOURCE_ID])],
    });
    const racing = withRepositoryState(database, (state) => ({
      ...state,
      relock: () => Promise.resolve(false),
    }));

    await expect(racing.loadAggregate()).rejects.toBeInstanceOf(PersistenceUnavailableError);
  });

  /*
   * Ticket 18 keeps what ticket 14 measured: rollback journal in `delete` mode
   * and `synchronous=FULL`. Journal mode is a property of the file once written,
   * so it is read after the repository has written. `synchronous` is
   * per-connection, and the driver sets only `foreign_keys` and `busy_timeout`
   * when it opens one (`@prisma-next/driver-sqlite`'s `openConnection`), so a
   * connection opened the same way reports what the driver's run with.
   */
  it('writes the file in rollback-journal delete mode with synchronous FULL', async () => {
    const { path, repository, database } = await opened();
    await repository.initializeAggregate({
      metaSpaceId: SPACE_ID,
      spaces: [space(SPACE_ID, 'Journalled', [RESOURCE_ID])],
    });

    // A static `import 'node:sqlite'` fails to load under this Vitest's resolver.
    const { DatabaseSync } = process.getBuiltinModule('node:sqlite');
    const connection = new DatabaseSync(path);
    try {
      expect(connection.prepare('PRAGMA journal_mode').get()).toEqual({ journal_mode: 'delete' });
    } finally {
      connection.close();
    }

    /*
     * `synchronous` is per-connection, so a freshly opened, independent
     * `DatabaseSync` (above) reports SQLite's own default and would not
     * notice the driver starting to set it on the connections it opens. Read
     * it instead through a connection the driver itself opened
     * (`SqliteDriver.execute`/`acquireConnection`, both `openConnection`),
     * via the one raw-SQL seam the ORM exposes: `pragma_synchronous` is a
     * SQLite table-valued function, embedded here through `database.raw` and
     * run as an ordinary `SELECT ... FROM` query through `database.runtime()`.
     */
    const synchronousPlan = database.sql.repository_state
      .select(() => ({
        synchronous: database.raw`(select synchronous from pragma_synchronous)`.returns(
          'sqlite/integer@1',
        ),
      }))
      .build();
    const synchronousRows: { synchronous: number }[] = [];
    for await (const row of database.runtime().execute(synchronousPlan)) {
      synchronousRows.push(row);
    }
    // 2 is FULL.
    expect(synchronousRows).toEqual([{ synchronous: 2 }]);
  });
});
