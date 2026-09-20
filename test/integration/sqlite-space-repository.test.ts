import { uuidSchema, type SpaceSnapshot, type UUID } from '@project/core';
import {
  AggregateInvariantError,
  REVISION_CEILING,
  RevisionCodecError,
} from '@project/persistence';
import { afterEach, describe, expect, it } from 'vitest';
import { createSqliteDatabase } from '../../src/sqlite/db';
import { SqlSpaceRepository } from '../../src/persistence/sql-space-repository';
import type { SpaceRepository } from '../../src/persistence/space-repository';
import { sqliteSqlStore } from '../../src/sqlite/sql-store';
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
const MISSING_RESOURCE_ID = uuidSchema.parse('c0000000-0000-4000-8000-000000000016');
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

const spaceWithDanglingEdge = (id: UUID, title: string, memberId: UUID): SpaceSnapshot => ({
  ...space(id, title, [memberId]),
  document: {
    version: 1,
    title,
    maps: [
      {
        id: MAP_ID,
        title: 'Dangling',
        kind: 'positioned',
        positions: { [memberId]: { x: 0, y: 0, open: false } },
        graphs: [
          { id: GRAPH_ID, title: 'Dangling', edges: [{ from: memberId, to: MISSING_RESOURCE_ID }] },
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

  it('answers uninitialized before any aggregate is established', async () => {
    const { repository } = await opened();

    await expect(repository.loadAggregate()).resolves.toEqual({ kind: 'uninitialized' });
    await expect(repository.listSpaces()).resolves.toEqual([]);
    await expect(repository.loadSpace(SPACE_ID)).resolves.toBeUndefined();
  });

  it('initializes, lists and loads a Meta-rooted aggregate', async () => {
    const { repository } = await opened();
    const first = space(SPACE_ID, 'One', [RESOURCE_ID]);

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
    const first = space(SPACE_ID, 'One', [RESOURCE_ID]);

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
      resources: [
        {
          id: RESOURCE_ID,
          document: { title: 'Resource', kind: 'markdown', body: 'Body' },
        },
      ],
    };
    const reordered: SpaceSnapshot = {
      id: SPACE_ID,
      document: { title: 'Meta', version: 1 },
      resources: [
        {
          id: RESOURCE_ID,
          document: { body: 'Body', kind: 'markdown', title: 'Resource' },
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
    const valid = space(SPACE_ID, 'Must roll back', [RESOURCE_ID]);
    const dangling = spaceWithDanglingEdge(OTHER_SPACE_ID, 'Dangling', OTHER_RESOURCE_ID);

    await expect(
      repository.initializeAggregate({ metaSpaceId: SPACE_ID, spaces: [valid, dangling] }),
    ).resolves.toMatchObject({ kind: 'aggregate-refused' });
    expect(await repository.listSpaces()).toEqual([]);
  });

  it("returns a Space's Resources in ascending id order however they were supplied", async () => {
    const { repository } = await opened();
    const descending = space(SPACE_ID, 'Unordered', [
      OTHER_RESOURCE_ID,
      SECOND_RESOURCE_ID,
      RESOURCE_ID,
    ]);
    const ascending = space(SPACE_ID, 'Unordered', [
      RESOURCE_ID,
      SECOND_RESOURCE_ID,
      OTHER_RESOURCE_ID,
    ]);

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
    const first = space(SPACE_ID, 'One', [RESOURCE_ID]);
    await repository.initializeAggregate({ metaSpaceId: SPACE_ID, spaces: [first] });

    const loaded = await repository.loadSpace(SPACE_ID);
    expect(loaded?.revision).toBe(0n);

    const row = await database.orm.Space.where({ id: SPACE_ID }).first();
    expect(row?.revision).toBe('0');
    // The ceiling itself, and revisions past `Number.MAX_SAFE_INTEGER`, round
    // trip identically on both databases now that `revision` is TEXT on
    // PostgreSQL too — proved once in `repository-contract.ts` (ticket 22)
    // rather than repeated per database here.
  });

  // `markExported`'s own `revision` argument is a caller-supplied `bigint`,
  // not a value read from or already written into either database -- so a
  // value the shared codec refuses on the way out is a bug in the caller
  // rather than broken stored state, and is left to escape as the plain
  // `RevisionCodecError` `encodeStoredRevision` raises (`sql-space-
  // repository.ts`'s `markExported` doc comment) instead of being
  // reclassified as `AggregateInvariantError` the way `#writeUpdate`'s own
  // next revision is.
  it('raises the codec failure for an exported revision above the 2^63-1 ceiling', async () => {
    const { repository } = await opened();
    const first = space(SPACE_ID, 'One', [RESOURCE_ID]);
    await repository.initializeAggregate({ metaSpaceId: SPACE_ID, spaces: [first] });

    await expect(repository.markExported(SPACE_ID, REVISION_CEILING + 1n)).rejects.toThrow(
      RevisionCodecError,
    );
    await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual(stored(first, 0n, null));
  });

  it('commits a topology-preserving update and reloads it', async () => {
    const { repository } = await opened();
    const first = space(SPACE_ID, 'One', [RESOURCE_ID]);
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
  const storedRow = (id: UUID, document: Readonly<Record<string, string | number>>) => ({
    id,
    document,
    revision: '0',
  });

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

  // `commit`'s fast path reads its candidate through `#loadStoredSpaceRow`,
  // the same private helper `loadSpace` calls directly, so a stored document
  // that fails intake escapes a fast-path `commit` exactly as unclassified as
  // it escapes `loadSpace` for the same row -- neither is
  // `AggregateInvariantError`, unlike `loadAggregate`/`initializeAggregate`/
  // `replaceAggregate` (through `#loadEverySpace`) two cases above this one.
  it("commit's fast path leaves a broken stored document as unclassified as loadSpace does", async () => {
    const { repository, database } = await opened();
    // `title` is required, so this row is JSON that fails Space intake -- the
    // same construction as "truncates a stored Space whose document does not
    // parse" above.
    await database.orm.Space.create(storedRow(SPACE_ID, { version: 1 }));
    await database.orm.RepositoryState.create({ singletonId: 1, metaSpaceId: SPACE_ID });

    await expect(repository.loadSpace(SPACE_ID)).rejects.not.toBeInstanceOf(
      AggregateInvariantError,
    );
    await expect(
      repository.commit({
        changes: [
          {
            kind: 'update',
            spaceId: SPACE_ID,
            snapshot: { id: SPACE_ID, document: { version: 1, title: 'Repaired' }, resources: [] },
            expectedRevision: 0n,
          },
        ],
      }),
    ).rejects.not.toBeInstanceOf(AggregateInvariantError);
  });

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

  it('truncates a stored Space whose revision is not canonical', async () => {
    const { repository, database } = await opened();
    // A raw ORM write is required: the repository's own `encodeStoredRevision`
    // (the shared codec, ADR 0095) refuses a non-canonical value before it
    // ever reaches the column, so only a write that bypasses it can store one
    // to read back.
    await database.orm.Space.create({
      id: OTHER_SPACE_ID,
      document: { version: 1, title: 'Orphan' },
      revision: '01',
    });
    await database.orm.RepositoryState.create({ singletonId: 1, metaSpaceId: OTHER_SPACE_ID });

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
    const first = space(SPACE_ID, 'Durable', [RESOURCE_ID]);
    await harness.repository.initializeAggregate({ metaSpaceId: SPACE_ID, spaces: [first] });
    await harness.database.close();

    const reopened = createSqliteDatabase(harness.path);
    close = async () => {
      await reopened.close();
      await harness.close();
    };
    const repository = new SqlSpaceRepository(sqliteSqlStore(reopened));
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
