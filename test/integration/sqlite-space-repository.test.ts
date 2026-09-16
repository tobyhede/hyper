import { uuidSchema, type SpaceSnapshot, type UUID } from '@project/core';
import { afterEach, describe, expect, it } from 'vitest';
import { createSqliteDatabase } from '../../src/sqlite/db';
import { SqliteSpaceRepository } from '../../src/persistence/sqlite-space-repository';
import { openSqliteRepository } from '../support/sqlite-harness';

const SPACE_ID = uuidSchema.parse('c0000000-0000-4000-8000-000000000001');
const OTHER_SPACE_ID = uuidSchema.parse('c0000000-0000-4000-8000-000000000002');
const MISSING_SPACE_ID = uuidSchema.parse('c0000000-0000-4000-8000-000000000003');
const THING_ID = uuidSchema.parse('c0000000-0000-4000-8000-000000000010');
const SECOND_THING_ID = uuidSchema.parse('c0000000-0000-4000-8000-000000000011');
const OTHER_THING_ID = uuidSchema.parse('c0000000-0000-4000-8000-000000000012');
const GRAPH_ID = uuidSchema.parse('c0000000-0000-4000-8000-000000000020');
const DIAGRAM_ID = uuidSchema.parse('c0000000-0000-4000-8000-000000000021');
const MISSING_THING_ID = uuidSchema.parse('c0000000-0000-4000-8000-000000000016');

const thing = (id: UUID, title: string) => ({
  id,
  document: { title, kind: 'markdown' as const, body: title },
});

const space = (id: UUID, title: string, thingIds: readonly UUID[]): SpaceSnapshot => ({
  id,
  document: { version: 1, title },
  things: thingIds.map((thingId) => thing(thingId, `${title} thing`)),
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
});
