import { uuidSchema, type ImportSpace, type SpaceSnapshot, type UUID } from '@project/core';
import { afterAll, afterEach, describe, expect, expectTypeOf, it } from 'vitest';
import { PostgresSpaceRepository } from '../../src/persistence/postgres-space-repository';
import type {
  RepositoryImportResult,
  SpaceRepository,
  StoredSpace,
} from '../../src/persistence/space-repository';
import { db } from '../../src/prisma/db';

expectTypeOf<Parameters<SpaceRepository['importSpaces']>[0]>().toEqualTypeOf<
  readonly ImportSpace[]
>();

const SPACE_ID = uuidSchema.parse('11111111-1111-4111-8111-111111111111');
const CARD_ID = uuidSchema.parse('22222222-2222-4222-8222-222222222222');
const OMITTED_CARD_ID = uuidSchema.parse('33333333-3333-4333-8333-333333333333');
const MISSING_SPACE_ID = uuidSchema.parse('44444444-4444-4444-8444-444444444444');
const ROUTE_ID = uuidSchema.parse('55555555-5555-4555-8555-555555555555');
const MISSING_CARD_ID = uuidSchema.parse('66666666-6666-4666-8666-666666666666');
const OTHER_SPACE_ID = uuidSchema.parse('77777777-7777-4777-8777-777777777777');
const OTHER_CARD_ID = uuidSchema.parse('88888888-8888-4888-8888-888888888888');
const CONCURRENT_SPACE_ID = uuidSchema.parse('99999999-9999-4999-8999-999999999999');
const MIXED_FIRST_CARD_ID = uuidSchema.parse('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
const MIXED_SECOND_CARD_ID = uuidSchema.parse('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
const UNRESOLVED_CARD_ID = uuidSchema.parse('cccccccc-cccc-4ccc-8ccc-cccccccccccc');

const createReadBarrier = (parties: number) => {
  let arrivals = 0;
  let release: (() => void) | undefined;
  const opened = new Promise<void>((resolve) => {
    release = resolve;
  });

  return async () => {
    arrivals += 1;
    if (arrivals === parties) release?.();
    await opened;
  };
};

const createGate = () => {
  let release: (() => void) | undefined;
  const opened = new Promise<void>((resolve) => {
    release = resolve;
  });

  return {
    open: () => release?.(),
    wait: () => opened,
  };
};

const databasePausedAfterFirstSpaceRead = (
  id: typeof SPACE_ID,
  barrier: () => Promise<void>,
  afterBarrier: () => Promise<void> = () => Promise.resolve(),
): typeof db =>
  new Proxy(db, {
    get(target, property, receiver) {
      if (property !== 'transaction') {
        const value: unknown = Reflect.get(target, property, receiver);
        return value;
      }

      const transaction: typeof db.transaction = (callback) =>
        db.transaction((context) => {
          let paused = false;
          const space = new Proxy(context.orm.public.Space, {
            get(spaceTarget, spaceProperty) {
              if (spaceProperty === 'first') {
                return async (...args: Parameters<typeof spaceTarget.first>) => {
                  const result = await spaceTarget.first(...args);
                  if (!paused && args[0].id === id) {
                    paused = true;
                    await barrier();
                    await afterBarrier();
                  }
                  return result;
                };
              }

              const value: unknown = Reflect.get(spaceTarget, spaceProperty, spaceTarget);
              if (typeof value !== 'function') return value;
              return (...args: unknown[]) => Reflect.apply(value, spaceTarget, args) as unknown;
            },
          });
          const publicNamespace = new Proxy(context.orm.public, {
            get(namespaceTarget, namespaceProperty, namespaceReceiver) {
              if (namespaceProperty === 'Space') return space;
              const value: unknown = Reflect.get(
                namespaceTarget,
                namespaceProperty,
                namespaceReceiver,
              );
              return value;
            },
          });
          const orm = new Proxy(context.orm, {
            get(ormTarget, ormProperty, ormReceiver) {
              if (ormProperty === 'public') return publicNamespace;
              const value: unknown = Reflect.get(ormTarget, ormProperty, ormReceiver);
              return value;
            },
          });
          const wrappedContext = new Proxy(context, {
            get(contextTarget, contextProperty, contextReceiver) {
              if (contextProperty === 'orm') return orm;
              const value: unknown = Reflect.get(contextTarget, contextProperty, contextReceiver);
              return value;
            },
          });

          return callback(wrappedContext);
        });

      return transaction;
    },
  });

const snapshot: SpaceSnapshot = {
  id: SPACE_ID,
  document: {
    version: 2,
    title: 'Repository space',
    routes: [],
  },
  cards: [
    {
      id: CARD_ID,
      document: {
        title: 'Stored card',
        kind: 'markdown',
        body: 'Stored through the repository.',
      },
    },
    {
      id: OMITTED_CARD_ID,
      document: {
        title: 'Card to remove',
        kind: 'markdown',
        body: 'Runtime commits are authoritative.',
      },
    },
  ],
};

const otherSnapshot: SpaceSnapshot = {
  id: OTHER_SPACE_ID,
  document: {
    version: 2,
    title: 'Other space',
    routes: [],
  },
  cards: [
    {
      id: OTHER_CARD_ID,
      document: {
        title: 'Other card',
        kind: 'markdown',
        body: 'Owned by the other space.',
      },
    },
  ],
};

const mixedImport: ImportSpace = {
  document: {
    version: 2,
    title: 'Mixed identity space',
    routes: [
      {
        title: 'Explicit card route',
        edges: [{ from: MIXED_FIRST_CARD_ID, to: MIXED_SECOND_CARD_ID }],
      },
    ],
    layouts: [
      {
        title: 'Mixed layout',
        kind: 'positioned',
        positions: { [MIXED_FIRST_CARD_ID]: { x: 40, y: 80 } },
      },
    ],
  },
  cards: [
    {
      id: MIXED_FIRST_CARD_ID,
      document: { title: 'First explicit card', kind: 'markdown', body: 'First.' },
    },
    {
      id: MIXED_SECOND_CARD_ID,
      document: { title: 'Second explicit card', kind: 'markdown', body: 'Second.' },
    },
    {
      document: { title: 'Generated card', kind: 'markdown', body: 'Generated.' },
    },
  ],
};

const allIdlessImport: ImportSpace = {
  document: {
    version: 2,
    title: 'All generated identities',
    routes: [],
    layouts: [
      {
        title: 'Generated empty layout',
        kind: 'positioned',
        positions: {},
      },
    ],
  },
  cards: [
    {
      document: { title: 'Generated only card', kind: 'markdown', body: 'Generated.' },
    },
  ],
};

describe('PostgresSpaceRepository', () => {
  const repository = new PostgresSpaceRepository(db);
  const createdSpaceIds = new Set<UUID>();

  const trackImported = (result: RepositoryImportResult): void => {
    if (result.kind !== 'imported') return;
    for (const stored of result.spaces) createdSpaceIds.add(stored.snapshot.id);
  };

  afterEach(async () => {
    for (const id of createdSpaceIds) {
      await db.orm.public.Card.where({ spaceId: id }).delete();
      await db.orm.public.Space.where({ id }).delete();
    }
    createdSpaceIds.clear();
    await db.orm.public.Card.where({ spaceId: SPACE_ID }).delete();
    await db.orm.public.Card.where({ spaceId: OTHER_SPACE_ID }).delete();
    await db.orm.public.Space.where({ id: SPACE_ID }).delete();
    await db.orm.public.Space.where({ id: OTHER_SPACE_ID }).delete();
    await db.orm.public.Space.where({ id: CONCURRENT_SPACE_ID }).delete();
  });

  afterAll(async () => {
    await db.close();
  });

  it('imports a completely identified space and exposes it through load and list', async () => {
    const imported = await repository.importSpaces([snapshot]);

    expect(imported).toEqual({
      kind: 'imported',
      spaces: [{ snapshot, revision: 0n, exportedRevision: null }],
    });
    if (imported.kind !== 'imported') {
      throw new Error(imported.kind === 'rejected' ? imported.message : 'Import conflicted');
    }
    await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual(imported.spaces[0]);
    await expect(repository.listSpaces()).resolves.toEqual([
      { id: SPACE_ID, title: 'Repository space' },
    ]);
  });

  it('commits an authoritative complete snapshot and advances its revision', async () => {
    await repository.importSpaces([snapshot]);
    const changed: SpaceSnapshot = {
      ...snapshot,
      document: { ...snapshot.document, title: 'Committed space' },
      cards: [
        {
          id: CARD_ID,
          document: {
            title: 'Changed card',
            kind: 'markdown',
            body: 'The newer complete snapshot wins.',
          },
        },
      ],
    };

    expect(await repository.commitSpace(changed, 0n)).toEqual({
      kind: 'committed',
      revision: 1n,
    });
    await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual({
      snapshot: changed,
      revision: 1n,
      exportedRevision: null,
    });
  });

  it('returns the current aggregate for a stale revision without changing it', async () => {
    await repository.importSpaces([snapshot]);
    const current: SpaceSnapshot = {
      ...snapshot,
      document: { ...snapshot.document, title: 'Current space' },
    };
    const stale: SpaceSnapshot = {
      ...snapshot,
      document: { ...snapshot.document, title: 'Stale overwrite' },
    };
    await repository.commitSpace(current, 0n);

    expect(await repository.commitSpace(stale, 0n)).toEqual({
      kind: 'conflict',
      current: {
        snapshot: current,
        revision: 1n,
        exportedRevision: null,
      },
    });
    await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual({
      snapshot: current,
      revision: 1n,
      exportedRevision: null,
    });
  });

  it('loads the space document and cards from one aggregate revision', async () => {
    const atRevision = (revision: number): SpaceSnapshot => ({
      ...snapshot,
      document: { ...snapshot.document, title: `Revision ${revision}` },
      cards: [
        {
          ...snapshot.cards[0]!,
          document: { ...snapshot.cards[0]!.document, title: `Revision ${revision}` },
        },
      ],
    });
    await repository.importSpaces([atRevision(0)]);

    const writeRevisions = async () => {
      for (let revision = 1; revision <= 50; revision += 1) {
        await expect(
          repository.commitSpace(atRevision(revision), BigInt(revision - 1)),
        ).resolves.toMatchObject({ kind: 'committed', revision: BigInt(revision) });
      }
    };
    const readRevisions = async () => {
      for (let read = 0; read < 75; read += 1) {
        const loaded = await repository.loadSpace(SPACE_ID);
        expect(loaded).toBeDefined();
        if (loaded === undefined) throw new Error('Imported space disappeared');

        const marker = `Revision ${loaded.revision}`;
        expect(loaded.snapshot.document.title).toBe(marker);
        expect(loaded.snapshot.cards).toHaveLength(1);
        expect(loaded.snapshot.cards[0]?.document.title).toBe(marker);
      }
    };

    await Promise.all([writeRevisions(), ...Array.from({ length: 4 }, readRevisions)]);
  });

  it('rejects a commit for an unknown space', async () => {
    const missing: SpaceSnapshot = {
      id: MISSING_SPACE_ID,
      document: { version: 2, title: 'Missing space', routes: [] },
      cards: [],
    };

    expect(await repository.commitSpace(missing, 0n)).toEqual({
      kind: 'rejected',
      code: 'not-found',
      message: `Space ${MISSING_SPACE_ID} does not exist`,
    });
    await expect(repository.loadSpace(MISSING_SPACE_ID)).resolves.toBeUndefined();
  });

  it('rejects a domain-invalid snapshot without changing the stored aggregate', async () => {
    await repository.importSpaces([snapshot]);
    const invalid: SpaceSnapshot = {
      ...snapshot,
      document: {
        ...snapshot.document,
        routes: [
          {
            id: ROUTE_ID,
            title: 'Dangling route',
            edges: [{ from: CARD_ID, to: MISSING_CARD_ID }],
          },
        ],
      },
    };

    await expect(repository.commitSpace(invalid, 0n)).resolves.toMatchObject({
      kind: 'rejected',
      code: 'invalid-snapshot',
    });
    await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual({
      snapshot,
      revision: 0n,
      exportedRevision: null,
    });
  });

  it('rejects a card owned by another space and rolls back the whole commit', async () => {
    await repository.importSpaces([snapshot, otherSnapshot]);
    const claimed: SpaceSnapshot = {
      ...snapshot,
      document: { ...snapshot.document, title: 'Must roll back' },
      cards: [...snapshot.cards, otherSnapshot.cards[0]!],
    };

    await expect(repository.commitSpace(claimed, 0n)).resolves.toMatchObject({
      kind: 'rejected',
      code: 'invalid-snapshot',
    });
    await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual({
      snapshot,
      revision: 0n,
      exportedRevision: null,
    });
    await expect(repository.loadSpace(OTHER_SPACE_ID)).resolves.toEqual({
      snapshot: otherSnapshot,
      revision: 0n,
      exportedRevision: null,
    });
  });

  it('keeps omitted cards when an identified space is imported again', async () => {
    await repository.importSpaces([snapshot]);
    const suppliedCard = {
      ...snapshot.cards[0]!,
      document: {
        ...snapshot.cards[0]!.document,
        title: 'Updated by import',
      },
    };
    const reimported: SpaceSnapshot = {
      ...snapshot,
      document: { ...snapshot.document, title: 'Reimported space' },
      cards: [suppliedCard],
    };

    const expected = {
      snapshot: {
        ...reimported,
        cards: [suppliedCard, snapshot.cards[1]!],
      },
      revision: 1n,
      exportedRevision: null,
    };

    await expect(repository.importSpaces([reimported])).resolves.toEqual({
      kind: 'imported',
      spaces: [expected],
    });
    await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual(expected);
  });

  it('allocates every missing identity without rewriting explicit references', async () => {
    const result = await repository.importSpaces([mixedImport]);
    trackImported(result);
    expect(result.kind).toBe('imported');
    if (result.kind !== 'imported') {
      throw new Error(result.kind === 'rejected' ? result.message : 'Import conflicted');
    }

    const stored = result.spaces[0]!;
    const route = stored.snapshot.document.routes[0]!;
    const layout = stored.snapshot.document.layouts?.[0];
    expect(layout).toBeDefined();
    if (layout === undefined) throw new Error('Generated layout was not returned');
    const generatedCard = stored.snapshot.cards.find(
      ({ id }) => id !== MIXED_FIRST_CARD_ID && id !== MIXED_SECOND_CARD_ID,
    );
    expect(generatedCard).toBeDefined();
    if (generatedCard === undefined) throw new Error('Generated card was not returned');
    const generatedIds = [stored.snapshot.id, generatedCard.id, route.id, layout.id];

    for (const id of generatedIds) expect(uuidSchema.safeParse(id).success).toBe(true);
    expect(new Set(generatedIds).size).toBe(4);
    expect(generatedIds).not.toContain(MIXED_FIRST_CARD_ID);
    expect(generatedIds).not.toContain(MIXED_SECOND_CARD_ID);
    expect(new Set(stored.snapshot.cards.map(({ id }) => id))).toEqual(
      new Set([MIXED_FIRST_CARD_ID, MIXED_SECOND_CARD_ID, generatedCard.id]),
    );
    expect(route.edges).toEqual([{ from: MIXED_FIRST_CARD_ID, to: MIXED_SECOND_CARD_ID }]);
    expect(layout.positions).toEqual({ [MIXED_FIRST_CARD_ID]: { x: 40, y: 80 } });
    await expect(repository.loadSpace(stored.snapshot.id)).resolves.toEqual(stored);
  });

  it('allocates disjoint identities for repeated all-id-less imports', async () => {
    const first = await repository.importSpaces([allIdlessImport]);
    trackImported(first);
    expect(first.kind).toBe('imported');
    if (first.kind !== 'imported') {
      throw new Error(first.kind === 'rejected' ? first.message : 'Import conflicted');
    }

    const second = await repository.importSpaces([allIdlessImport]);
    trackImported(second);
    expect(second.kind).toBe('imported');
    if (second.kind !== 'imported') {
      throw new Error(second.kind === 'rejected' ? second.message : 'Import conflicted');
    }

    const identities = (stored: StoredSpace): UUID[] => [
      stored.snapshot.id,
      stored.snapshot.cards[0]!.id,
      stored.snapshot.document.layouts![0]!.id,
    ];
    const firstIds = identities(first.spaces[0]!);
    const secondIds = identities(second.spaces[0]!);
    for (const id of [...firstIds, ...secondIds]) {
      expect(uuidSchema.safeParse(id).success).toBe(true);
    }
    expect(new Set([...firstIds, ...secondIds]).size).toBe(6);
  });

  it('rejects reuse of explicit cards by a generated space and rolls back the batch', async () => {
    await repository.importSpaces([snapshot]);
    const first = await repository.importSpaces([mixedImport]);
    trackImported(first);
    expect(first.kind).toBe('imported');
    if (first.kind !== 'imported') {
      throw new Error(first.kind === 'rejected' ? first.message : 'Import conflicted');
    }
    const firstStored = first.spaces[0]!;
    const catalogBefore = await repository.listSpaces();
    const changedKnown: SpaceSnapshot = {
      ...snapshot,
      document: { ...snapshot.document, title: 'Must roll back before ownership rejection' },
    };

    const second = await repository.importSpaces([changedKnown, mixedImport]);
    trackImported(second);

    expect(second).toMatchObject({ kind: 'rejected', code: 'card-ownership' });
    if (second.kind !== 'rejected') throw new Error('Conflicting import was not rejected');
    expect(second.message).toContain(MIXED_FIRST_CARD_ID);
    await expect(repository.listSpaces()).resolves.toEqual(catalogBefore);
    await expect(repository.loadSpace(firstStored.snapshot.id)).resolves.toEqual(firstStored);
    await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual({
      snapshot,
      revision: 0n,
      exportedRevision: null,
    });
  });

  it('rejects unresolved UUID references after allocation and rolls back every generated row', async () => {
    await repository.importSpaces([snapshot, otherSnapshot]);
    const catalogBefore = await repository.listSpaces();
    const knownSpaceBefore = await repository.loadSpace(SPACE_ID);
    const otherSpaceBefore = await repository.loadSpace(OTHER_SPACE_ID);
    const invalid: ImportSpace = {
      document: {
        version: 2,
        title: 'Invalid generated space',
        routes: [
          {
            title: 'Unresolved route',
            edges: [{ from: UNRESOLVED_CARD_ID, to: MISSING_CARD_ID }],
          },
        ],
      },
      cards: [
        {
          document: { title: 'Id-less card', kind: 'markdown', body: 'Cannot be referenced.' },
        },
      ],
    };

    const result = await repository.importSpaces([invalid]);
    trackImported(result);

    expect(result).toMatchObject({ kind: 'rejected', code: 'invalid-snapshot' });
    if (result.kind !== 'rejected') throw new Error('Invalid import was not rejected');
    expect(result.message).toContain(UNRESOLVED_CARD_ID);
    await expect(repository.listSpaces()).resolves.toEqual(catalogBefore);
    await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual(knownSpaceBefore);
    await expect(repository.loadSpace(OTHER_SPACE_ID)).resolves.toEqual(otherSpaceBefore);
  });

  it('rejects duplicate durable identities across an import batch', async () => {
    const duplicate = {
      ...snapshot,
      document: { ...snapshot.document, title: 'Duplicate identity' },
    };

    await expect(repository.importSpaces([snapshot, duplicate])).resolves.toMatchObject({
      kind: 'rejected',
      code: 'duplicate-identity',
    });
    await expect(repository.loadSpace(SPACE_ID)).resolves.toBeUndefined();
  });

  it('rejects a cross-space card in an import and rolls back the whole batch', async () => {
    await repository.importSpaces([snapshot, otherSnapshot]);
    const changedFirst: SpaceSnapshot = {
      ...snapshot,
      document: { ...snapshot.document, title: 'Must not persist' },
    };
    const claimedByOther: SpaceSnapshot = {
      ...otherSnapshot,
      cards: [...otherSnapshot.cards, snapshot.cards[0]!],
    };

    await expect(repository.importSpaces([changedFirst, claimedByOther])).resolves.toMatchObject({
      kind: 'rejected',
      code: 'duplicate-identity',
    });
    await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual({
      snapshot,
      revision: 0n,
      exportedRevision: null,
    });
    await expect(repository.loadSpace(OTHER_SPACE_ID)).resolves.toEqual({
      snapshot: otherSnapshot,
      revision: 0n,
      exportedRevision: null,
    });
  });

  it('passes expected revisions beyond the safe integer range without narrowing', async () => {
    await repository.importSpaces([snapshot]);
    const unsafeRevision = BigInt(Number.MAX_SAFE_INTEGER) + 1n;

    await expect(repository.commitSpace(snapshot, unsafeRevision)).resolves.toEqual({
      kind: 'conflict',
      current: {
        snapshot,
        revision: 0n,
        exportedRevision: null,
      },
    });
  });

  it('returns a typed conflict and rolls back the losing batch after a concurrent update', async () => {
    await repository.importSpaces([snapshot, otherSnapshot]);
    const barrier = createReadBarrier(2);
    const winnerCommitted = createGate();
    const winner = new PostgresSpaceRepository(
      databasePausedAfterFirstSpaceRead(SPACE_ID, barrier),
    );
    const loser = new PostgresSpaceRepository(
      databasePausedAfterFirstSpaceRead(SPACE_ID, barrier, winnerCommitted.wait),
    );
    const winningSnapshot: SpaceSnapshot = {
      ...snapshot,
      document: { ...snapshot.document, title: 'Concurrent winner' },
    };
    const losingSnapshot: SpaceSnapshot = {
      ...snapshot,
      document: { ...snapshot.document, title: 'Concurrent loser' },
    };
    const earlierLosingWrite: SpaceSnapshot = {
      ...otherSnapshot,
      document: { ...otherSnapshot.document, title: 'Must roll back' },
    };

    const winningImport = winner.importSpaces([winningSnapshot]).finally(winnerCommitted.open);
    const [winningResult, losingResult] = await Promise.all([
      winningImport,
      loser.importSpaces([earlierLosingWrite, losingSnapshot]),
    ]);

    expect(winningResult).toEqual({
      kind: 'imported',
      spaces: [{ snapshot: winningSnapshot, revision: 1n, exportedRevision: null }],
    });
    expect(losingResult).toEqual({
      kind: 'conflict',
      current: { snapshot: winningSnapshot, revision: 1n, exportedRevision: null },
    });
    await expect(repository.loadSpace(OTHER_SPACE_ID)).resolves.toEqual({
      snapshot: otherSnapshot,
      revision: 0n,
      exportedRevision: null,
    });
  });

  it('returns a typed conflict when another import creates the space first', async () => {
    const barrier = createReadBarrier(2);
    const winnerCommitted = createGate();
    const winner = new PostgresSpaceRepository(
      databasePausedAfterFirstSpaceRead(CONCURRENT_SPACE_ID, barrier),
    );
    const loser = new PostgresSpaceRepository(
      databasePausedAfterFirstSpaceRead(CONCURRENT_SPACE_ID, barrier, winnerCommitted.wait),
    );
    const winningSnapshot: SpaceSnapshot = {
      id: CONCURRENT_SPACE_ID,
      document: { version: 2, title: 'Concurrent create winner', routes: [] },
      cards: [],
    };
    const losingSnapshot: SpaceSnapshot = {
      ...winningSnapshot,
      document: { ...winningSnapshot.document, title: 'Concurrent create loser' },
    };

    const winningImport = winner.importSpaces([winningSnapshot]).finally(winnerCommitted.open);
    const [winningResult, losingResult] = await Promise.all([
      winningImport,
      loser.importSpaces([losingSnapshot]),
    ]);

    expect(winningResult).toEqual({
      kind: 'imported',
      spaces: [{ snapshot: winningSnapshot, revision: 0n, exportedRevision: null }],
    });
    expect(losingResult).toEqual({
      kind: 'conflict',
      current: { snapshot: winningSnapshot, revision: 0n, exportedRevision: null },
    });
  });
});
