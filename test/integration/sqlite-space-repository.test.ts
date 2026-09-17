import { uuidSchema, type SpaceSnapshot, type UUID } from '@project/core';
import { AggregateInvariantError } from '@project/persistence';
import { afterEach, describe, expect, it } from 'vitest';
import { createSqliteDatabase } from '../../src/sqlite/db';
import { SqliteSpaceRepository } from '../../src/persistence/sqlite-space-repository';
import { spaceRepositoryContract } from '../support/repository-contract';
import { openSqliteRepository } from '../support/sqlite-harness';

spaceRepositoryContract('SqliteSpaceRepository', async () => {
  const harness = await openSqliteRepository();
  return { repository: harness.repository, close: harness.close };
});

const SPACE_ID = uuidSchema.parse('c0000000-0000-4000-8000-000000000001');
const OTHER_SPACE_ID = uuidSchema.parse('c0000000-0000-4000-8000-000000000002');
const MISSING_SPACE_ID = uuidSchema.parse('c0000000-0000-4000-8000-000000000003');
const THING_ID = uuidSchema.parse('c0000000-0000-4000-8000-000000000010');
const SECOND_THING_ID = uuidSchema.parse('c0000000-0000-4000-8000-000000000011');
const OTHER_THING_ID = uuidSchema.parse('c0000000-0000-4000-8000-000000000012');
const GRAPH_ID = uuidSchema.parse('c0000000-0000-4000-8000-000000000020');
const DIAGRAM_ID = uuidSchema.parse('c0000000-0000-4000-8000-000000000021');
const MISSING_THING_ID = uuidSchema.parse('c0000000-0000-4000-8000-000000000016');
const LINK_THING_ID = uuidSchema.parse('c0000000-0000-4000-8000-000000000013');

const thing = (id: UUID, title: string) => ({
  id,
  document: { title, kind: 'markdown' as const, body: title },
});

const space = (id: UUID, title: string, thingIds: readonly UUID[]): SpaceSnapshot => ({
  id,
  document: { version: 1, title },
  things: thingIds.map((thingId) => thing(thingId, `${title} thing`)),
});

const spaceThing = (
  id: UUID,
  target: UUID,
  selection: { readonly diagram: UUID; readonly graph: UUID },
) => ({
  id,
  document: { title: `Open ${target}`, kind: 'space' as const, spaceId: target, ...selection },
});

const targetSpace = (id: UUID, title: string, thingIds: readonly UUID[]): SpaceSnapshot => ({
  ...space(id, title, thingIds),
  document: {
    version: 1,
    title,
    defaultDiagram: DIAGRAM_ID,
    diagrams: [
      {
        id: DIAGRAM_ID,
        title: 'Diagram 1',
        kind: 'positioned',
        positions: {},
        graphs: [{ id: GRAPH_ID, title: 'Graph 1', edges: [] }],
        activeGraph: GRAPH_ID,
      },
    ],
  },
});

const spaceWithDanglingEdge = (id: UUID, title: string, memberId: UUID): SpaceSnapshot => ({
  ...space(id, title, [memberId]),
  document: {
    version: 1,
    title,
    diagrams: [
      {
        id: DIAGRAM_ID,
        title: 'Dangling',
        kind: 'positioned',
        positions: { [memberId]: { x: 0, y: 0, open: false } },
        graphs: [
          { id: GRAPH_ID, title: 'Dangling', edges: [{ from: memberId, to: MISSING_THING_ID }] },
        ],
      },
    ],
  },
});

const retitled = (snapshot: SpaceSnapshot, title: string): SpaceSnapshot => ({
  ...snapshot,
  document: { ...snapshot.document, title },
});

const stored = (snapshot: SpaceSnapshot, revision: bigint, exportedRevision: bigint | null) => ({
  snapshot,
  revision,
  exportedRevision,
});

describe('SqliteSpaceRepository', () => {
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

  it('answers uninitialized before any aggregate is established', async () => {
    const { repository } = await opened();

    await expect(repository.loadAggregate()).resolves.toEqual({ kind: 'uninitialized' });
    await expect(repository.listSpaces()).resolves.toEqual([]);
    await expect(repository.loadSpace(SPACE_ID)).resolves.toBeUndefined();
  });

  it('initializes, lists and loads a Meta-rooted aggregate', async () => {
    const { repository } = await opened();
    const first = space(SPACE_ID, 'One', [THING_ID]);

    await expect(
      repository.initializeAggregate({ metaSpaceId: SPACE_ID, spaces: [first] }),
    ).resolves.toEqual({
      kind: 'initialized',
      aggregate: { metaSpaceId: SPACE_ID, spaces: [stored(first, 0n, null)] },
    });
    expect(new Set(await repository.listSpaces())).toEqual(
      new Set([{ id: SPACE_ID, title: 'One' }]),
    );
    await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual(stored(first, 0n, null));
    await expect(repository.loadSpace(MISSING_SPACE_ID)).resolves.toBeUndefined();
    await expect(repository.loadAggregate()).resolves.toEqual({
      kind: 'loaded',
      aggregate: { metaSpaceId: SPACE_ID, spaces: [stored(first, 0n, null)] },
    });
  });

  it('classifies an identical later initialization as existing and a different one as already-initialized', async () => {
    const { repository } = await opened();
    const first = space(SPACE_ID, 'One', [THING_ID]);

    await expect(
      repository.initializeAggregate({ metaSpaceId: SPACE_ID, spaces: [first] }),
    ).resolves.toMatchObject({ kind: 'initialized' });
    await expect(
      repository.initializeAggregate({ metaSpaceId: SPACE_ID, spaces: [structuredClone(first)] }),
    ).resolves.toMatchObject({ kind: 'existing' });
    await expect(
      repository.initializeAggregate({
        metaSpaceId: SPACE_ID,
        spaces: [retitled(first, 'Different')],
      }),
    ).resolves.toMatchObject({ kind: 'already-initialized' });
    await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual(stored(first, 0n, null));
  });

  it('ignores object-key insertion order when classifying initialization', async () => {
    const { repository } = await opened();
    const first: SpaceSnapshot = {
      id: SPACE_ID,
      document: { version: 1, title: 'Meta' },
      things: [
        {
          id: THING_ID,
          document: { title: 'Thing', kind: 'markdown', body: 'Body' },
        },
      ],
    };
    const reordered: SpaceSnapshot = {
      id: SPACE_ID,
      document: { title: 'Meta', version: 1 },
      things: [
        {
          id: THING_ID,
          document: { body: 'Body', kind: 'markdown', title: 'Thing' },
        },
      ],
    };

    await expect(
      repository.initializeAggregate({ metaSpaceId: SPACE_ID, spaces: [first] }),
    ).resolves.toMatchObject({ kind: 'initialized' });
    await expect(
      repository.initializeAggregate({ metaSpaceId: SPACE_ID, spaces: [reordered] }),
    ).resolves.toMatchObject({ kind: 'existing' });
  });

  it('refuses an invalid aggregate and stores none of it', async () => {
    const { repository } = await opened();
    const valid = space(SPACE_ID, 'Must roll back', [THING_ID]);
    const dangling = spaceWithDanglingEdge(OTHER_SPACE_ID, 'Dangling', OTHER_THING_ID);

    await expect(
      repository.initializeAggregate({ metaSpaceId: SPACE_ID, spaces: [valid, dangling] }),
    ).resolves.toMatchObject({ kind: 'aggregate-refused' });
    expect(await repository.listSpaces()).toEqual([]);
  });

  it("returns a Space's Things in ascending id order however they were supplied", async () => {
    const { repository } = await opened();
    const descending = space(SPACE_ID, 'Unordered', [OTHER_THING_ID, SECOND_THING_ID, THING_ID]);
    const ascending = space(SPACE_ID, 'Unordered', [THING_ID, SECOND_THING_ID, OTHER_THING_ID]);

    await expect(
      repository.initializeAggregate({ metaSpaceId: SPACE_ID, spaces: [descending] }),
    ).resolves.toEqual({
      kind: 'initialized',
      aggregate: { metaSpaceId: SPACE_ID, spaces: [stored(ascending, 0n, null)] },
    });
    await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual(stored(ascending, 0n, null));
  });

  it('speaks bigint at the repository boundary and stores canonical decimal text', async () => {
    const { repository, database } = await opened();
    const first = space(SPACE_ID, 'One', [THING_ID]);
    await repository.initializeAggregate({ metaSpaceId: SPACE_ID, spaces: [first] });

    const loaded = await repository.loadSpace(SPACE_ID);
    expect(loaded?.revision).toBe(0n);

    const row = await database.orm.Space.where({ id: SPACE_ID }).first();
    expect(row?.revision).toBe('0');

    const maxSigned = (2n ** 63n - 1n).toString();
    await database.orm.Space.where({ id: SPACE_ID }).update({
      revision: maxSigned,
      exportedRevision: '0',
    });
    await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual(
      stored(first, 2n ** 63n - 1n, 0n),
    );
  });

  it('commits a topology-preserving update and reloads it', async () => {
    const { repository } = await opened();
    const first = space(SPACE_ID, 'One', [THING_ID]);
    await repository.initializeAggregate({ metaSpaceId: SPACE_ID, spaces: [first] });
    const changed = retitled(first, 'Changed');

    await expect(
      repository.commit({
        changes: [
          {
            kind: 'update',
            spaceId: SPACE_ID,
            snapshot: changed,
            expectedRevision: 0n,
          },
        ],
      }),
    ).resolves.toEqual({
      kind: 'committed',
      revisions: [{ spaceId: SPACE_ID, revision: 1n }],
      deletedSpaceIds: [],
    });
    await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual(stored(changed, 1n, null));
  });

  // The pinned driver opens a new database handle for every transaction, so two
  // overlapping transactions through this one client are two SQLite connections
  // on one file. Neither case below may wait out the driver's 5000ms busy_timeout.
  const WELL_UNDER_BUSY_TIMEOUT_MS = 1_000;

  it('serves two overlapping aggregate reads through one client without waiting on each other', async () => {
    const { repository } = await opened();
    const first = space(SPACE_ID, 'One', [THING_ID]);
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
    const first = space(SPACE_ID, 'One', [THING_ID]);

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

  it('commits and reloads revisions above Number.MAX_SAFE_INTEGER as canonical decimal text', async () => {
    const { repository, database } = await opened();
    const first = space(SPACE_ID, 'One', [THING_ID]);
    await repository.initializeAggregate({ metaSpaceId: SPACE_ID, spaces: [first] });
    const aboveSafe = BigInt(Number.MAX_SAFE_INTEGER) + 1n;
    await database.orm.Space.where({ id: SPACE_ID }).update({
      revision: aboveSafe.toString(),
    });
    const changed = retitled(first, 'Above safe');

    await expect(
      repository.commit({
        changes: [
          {
            kind: 'update',
            spaceId: SPACE_ID,
            snapshot: changed,
            expectedRevision: aboveSafe,
          },
        ],
      }),
    ).resolves.toEqual({
      kind: 'committed',
      revisions: [{ spaceId: SPACE_ID, revision: aboveSafe + 1n }],
      deletedSpaceIds: [],
    });
    await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual(
      stored(changed, aboveSafe + 1n, null),
    );
    const row = await database.orm.Space.where({ id: SPACE_ID }).first();
    expect(row?.revision).toBe((aboveSafe + 1n).toString());
  });

  it('serialises overlapping in-process commits at different Spaces well under the busy timeout', async () => {
    const { repository } = await opened();
    const child = targetSpace(OTHER_SPACE_ID, 'Child', [OTHER_THING_ID]);
    const meta = {
      ...space(SPACE_ID, 'Meta', [THING_ID]),
      things: [
        thing(THING_ID, 'Meta thing'),
        spaceThing(LINK_THING_ID, OTHER_SPACE_ID, { diagram: DIAGRAM_ID, graph: GRAPH_ID }),
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
  const linkThingId = (index: number) =>
    uuidSchema.parse(`e0000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`);

  for (const commitKind of COMMIT_KINDS) {
    for (const ordering of ORDERINGS) {
      it(`serves loadSpace and listSpaces overlapping a ${commitKind} commit (${ordering}) well under the busy timeout`, async () => {
        const { repository } = await opened();
        const linkedSpaces = Array.from({ length: LINKED_SPACES }, (_, index) =>
          targetSpace(linkedSpaceId(index), `Linked ${index}`, []),
        );
        const meta: SpaceSnapshot = {
          ...space(SPACE_ID, 'Meta', [THING_ID, SECOND_THING_ID]),
          things: [
            thing(THING_ID, 'Meta thing'),
            thing(SECOND_THING_ID, 'Second meta thing'),
            ...linkedSpaces.map(({ id }, index) =>
              spaceThing(linkThingId(index), id, { diagram: DIAGRAM_ID, graph: GRAPH_ID }),
            ),
          ],
        };
        await expect(
          repository.initializeAggregate({
            metaSpaceId: SPACE_ID,
            spaces: [meta, ...linkedSpaces],
          }),
        ).resolves.toMatchObject({ kind: 'initialized' });
        const child = targetSpace(OTHER_SPACE_ID, 'Child', [OTHER_THING_ID]);
        const linked: SpaceSnapshot = {
          ...retitled(meta, 'Meta linked'),
          things: [
            ...meta.things,
            spaceThing(LINK_THING_ID, OTHER_SPACE_ID, { diagram: DIAGRAM_ID, graph: GRAPH_ID }),
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
   * truncates it (ADR 0092), still authorized by the Meta identity it read.
   */
  const storedRow = (id: UUID, document: Readonly<Record<string, string | number>>) => ({
    id,
    document,
    revision: '0',
  });

  const proposed = space(SPACE_ID, 'Proposal', [THING_ID]);
  const proposal = { metaSpaceId: SPACE_ID, spaces: [proposed] };

  const expectReadAndInitializeRefuse = async (
    repository: SqliteSpaceRepository,
  ): Promise<void> => {
    await expect(repository.loadAggregate()).rejects.toThrow(AggregateInvariantError);
    await expect(repository.initializeAggregate(proposal)).rejects.toThrow(AggregateInvariantError);
  };

  const expectTruncatedTo = async (repository: SqliteSpaceRepository): Promise<void> => {
    await expect(repository.loadAggregate()).resolves.toEqual({
      kind: 'loaded',
      aggregate: { metaSpaceId: SPACE_ID, spaces: [stored(proposed, 0n, null)] },
    });
  };

  it('truncates Spaces stored without a Meta identity, and only when it expected none', async () => {
    const { repository, database } = await opened();
    await database.orm.Space.create(storedRow(OTHER_SPACE_ID, { version: 1, title: 'Orphan' }));

    await expectReadAndInitializeRefuse(repository);
    await expect(repository.loadMetaSpaceId()).resolves.toBeUndefined();
    await expect(repository.replaceAggregate(proposal, OTHER_SPACE_ID)).resolves.toEqual({
      kind: 'conflict',
      currentMetaSpaceId: undefined,
    });
    await expect(repository.replaceAggregate(proposal, undefined)).resolves.toMatchObject({
      kind: 'replaced',
    });
    await expectTruncatedTo(repository);
  });

  it('truncates a stored aggregate that fails complete intake', async () => {
    const { repository, database } = await opened();
    await database.transaction(async ({ orm }) => {
      await orm.Space.create(storedRow(SPACE_ID, { version: 1, title: 'Meta' }));
      await orm.Space.create(storedRow(OTHER_SPACE_ID, { version: 1, title: 'Unreferenced' }));
      await orm.RepositoryState.create({ singletonId: 1, metaSpaceId: SPACE_ID });
    });

    await expectReadAndInitializeRefuse(repository);
    await expect(repository.replaceAggregate(proposal, SPACE_ID)).resolves.toMatchObject({
      kind: 'replaced',
    });
    await expectTruncatedTo(repository);
  });

  it('truncates a stored Space whose document does not parse', async () => {
    const { repository, database } = await opened();
    await database.transaction(async ({ orm }) => {
      // `title` is required, so this row is JSON that fails Space intake.
      await orm.Space.create(storedRow(OTHER_SPACE_ID, { version: 1 }));
      await orm.RepositoryState.create({ singletonId: 1, metaSpaceId: OTHER_SPACE_ID });
    });

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

  it('still shows the established aggregate after close and reopen against the same file', async () => {
    const harness = await opened();
    const first = space(SPACE_ID, 'Durable', [THING_ID]);
    await harness.repository.initializeAggregate({ metaSpaceId: SPACE_ID, spaces: [first] });
    await harness.database.close();

    const reopened = createSqliteDatabase(harness.path);
    close = async () => {
      await reopened.close();
      await harness.close();
    };
    const repository = new SqliteSpaceRepository(reopened);
    await expect(repository.loadAggregate()).resolves.toEqual({
      kind: 'loaded',
      aggregate: { metaSpaceId: SPACE_ID, spaces: [stored(first, 0n, null)] },
    });
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
      spaces: [space(SPACE_ID, 'Journalled', [THING_ID])],
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
