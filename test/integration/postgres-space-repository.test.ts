import { uuidSchema, type ImportSpace, type SpaceSnapshot, type UUID } from '@project/core';
import type { LoadedSpace } from '@project/persistence';
import { afterAll, afterEach, beforeEach, describe, expect, expectTypeOf, it } from 'vitest';
import { PostgresSpaceRepository } from '../../src/persistence/postgres-space-repository';
import type {
  ImportMode,
  RepositoryImportResult,
  SpaceRepository,
} from '../../src/persistence/space-repository';
import { db } from '../../src/prisma/db';
import { spaceRepositoryContract } from '../support/repository-contract';

expectTypeOf<Parameters<SpaceRepository['importSpaces']>[0]>().toEqualTypeOf<
  readonly ImportSpace[]
>();
expectTypeOf<Parameters<SpaceRepository['importSpaces']>[1]>().toEqualTypeOf<ImportMode>();

/**
 * Every Hyper row, gone. The same thing `--dangerous-truncate` does, and safe
 * for the same reason the truncate-mode tests below are: `fileParallelism` is
 * off, so one integration file at a time owns the single `DATABASE_URL`.
 */
const clearHyperContent = async (): Promise<void> => {
  await db.orm.public.RepositoryState.where({ singletonId: 1 }).delete();
  for (const space of await db.orm.public.Space.all()) {
    await db.orm.public.Card.where({ spaceId: space.id }).deleteAll();
    await db.orm.public.Space.where({ id: space.id }).delete();
  }
};

const seedRepositoryState = async (metaSpaceId: UUID): Promise<void> => {
  const current = await db.orm.public.RepositoryState.where({ singletonId: 1 }).first();
  if (current !== null) return;
  await db.orm.public.RepositoryState.create({ singletonId: 1, metaSpaceId });
};

/*
 * Declared before the suite below so it runs before it, and therefore before the
 * `afterAll` that closes the connection. The harness owns a clean database at
 * both ends rather than tracking the ids it created: half these cases are about
 * what a rejected batch leaves behind, and a per-id cleanup list would be
 * written from the same assumption the test is checking.
 */
// Deliberately unseeded: a repository has to reach a committable state from an
// empty store on its own, and every case here begins by importing the contract's
// Meta Space. Seeding it by hand hid that the PostgreSQL adapter could not.
spaceRepositoryContract('PostgresSpaceRepository', async () => {
  await clearHyperContent();
  const repository = new PostgresSpaceRepository(db);
  const harness: SpaceRepository = {
    entrySpaceId: () => repository.entrySpaceId(),
    setEntrySpace: (id) => repository.setEntrySpace(id),
    listSpaces: () => repository.listSpaces(),
    loadSpace: (id) => repository.loadSpace(id),
    loadAggregate: () => repository.loadAggregate(),
    commit: (request) => repository.commit(request),
    markExported: (id, revision) => repository.markExported(id, revision),
    importSpaces: (input, mode) => repository.importSpaces(input, mode),
  };
  return { repository: harness, close: clearHyperContent };
});

const SPACE_ID = uuidSchema.parse('11111111-1111-4111-8111-111111111111');
const CARD_ID = uuidSchema.parse('22222222-2222-4222-8222-222222222222');
const OMITTED_CARD_ID = uuidSchema.parse('33333333-3333-4333-8333-333333333333');
const MISSING_SPACE_ID = uuidSchema.parse('44444444-4444-4444-8444-444444444444');
const GRAPH_ID = uuidSchema.parse('55555555-5555-4555-8555-555555555555');
const MISSING_CARD_ID = uuidSchema.parse('66666666-6666-4666-8666-666666666666');
const OTHER_SPACE_ID = uuidSchema.parse('77777777-7777-4777-8777-777777777777');
const OTHER_CARD_ID = uuidSchema.parse('88888888-8888-4888-8888-888888888888');
const CONCURRENT_SPACE_ID = uuidSchema.parse('99999999-9999-4999-8999-999999999999');
const MIXED_FIRST_CARD_ID = uuidSchema.parse('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
const MIXED_SECOND_CARD_ID = uuidSchema.parse('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
const UNRESOLVED_CARD_ID = uuidSchema.parse('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
const ORDERED_SPACE_ID = uuidSchema.parse('dddddddd-dddd-4ddd-8ddd-dddddddddddd');
const ALL_IDLESS_CARD_ID = uuidSchema.parse('ffffffff-ffff-4fff-8fff-ffffffffffff');
const SECOND_IDLESS_CARD_ID = uuidSchema.parse('fefefefe-fefe-4fef-8fef-fefefefefefe');
const LAYOUT_ID = uuidSchema.parse('0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a');
const OTHER_LAYOUT_ID = uuidSchema.parse('0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b');
const ORDERED_CARD_IDS = [
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
    version: 1,
    title: 'Other space',
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
    version: 1,
    title: 'Mixed identity space',
    layouts: [
      {
        title: 'Mixed layout',
        kind: 'positioned',
        positions: {
          [MIXED_FIRST_CARD_ID]: { x: 40, y: 80, open: false },
          [MIXED_SECOND_CARD_ID]: { x: 300, y: 80, open: false },
        },
        graphs: [
          {
            title: 'Explicit card graph',
            edges: [{ from: MIXED_FIRST_CARD_ID, to: MIXED_SECOND_CARD_ID }],
          },
        ],
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

/**
 * Every id an import may leave out, left out — which under version 1 is
 * everything except the card an edge names.
 *
 * A layout owns at least one graph, a graph holds at least one edge, and an
 * edge names its endpoints by id, so a card an edge reaches cannot be id-less
 * and still be reachable: there would be no value to write in the edge. The
 * card id is therefore the one identity supplied, and it is a parameter because
 * cards are rows — a second import reusing it would collide on the primary key
 * and be rejected, which is a different fact from the one below.
 */
const idlessImport = (cardId: UUID): ImportSpace => ({
  document: {
    version: 1,
    title: 'All generated identities',
    layouts: [
      {
        title: 'Generated layout',
        kind: 'positioned',
        positions: { [cardId]: { x: 0, y: 0, open: false } },
        graphs: [{ title: 'Generated graph', edges: [{ from: cardId, to: cardId }] }],
      },
    ],
  },
  cards: [
    {
      id: cardId,
      document: { title: 'Generated only card', kind: 'markdown', body: 'Generated.' },
    },
  ],
});

describe('PostgresSpaceRepository', () => {
  const repository = new PostgresSpaceRepository(db);
  const createdSpaceIds = new Set<UUID>();
  const commitSpace = (next: SpaceSnapshot, expectedRevision: bigint) =>
    repository.commit({
      changes: [{ kind: 'update', spaceId: next.id, snapshot: next, expectedRevision }],
    });

  const trackImported = (result: RepositoryImportResult): void => {
    if (result.kind !== 'imported') return;
    for (const stored of result.spaces) createdSpaceIds.add(stored.snapshot.id);
  };

  beforeEach(async () => seedRepositoryState(SPACE_ID));

  afterEach(async () => {
    await db.orm.public.RepositoryState.where({ singletonId: 1 }).delete();
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
      throw new Error(imported.message);
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
    await repository.importSpaces([snapshot]);
    const exported = await repository.loadSpace(SPACE_ID);
    expect(exported).toBeDefined();
    if (exported === undefined) throw new Error('Imported space disappeared');
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
    await repository.importSpaces([snapshot]);
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
        if (loaded === undefined) throw new Error('Imported space disappeared');

        const marker = `Revision ${loaded.revision}`;
        expect(loaded.snapshot.document.title).toBe(marker);
        expect(loaded.snapshot.cards).toHaveLength(1);
        expect(loaded.snapshot.cards[0]?.document.title).toBe(marker);
      }
    };

    await Promise.all([writeRevisions(), ...Array.from({ length: 4 }, readRevisions)]);
  });

  it('returns cards in id order however they were stored', async () => {
    // Card order is now the include aggregate's ORDER BY rather than a separate
    // query's, so it needs pinning at the one place that can tell the
    // difference: cards supplied in reverse id order. Every other fixture here
    // supplies them already sorted, where an unordered aggregate would pass.
    const [first, second, third] = ORDERED_CARD_IDS;
    const card = (id: UUID, title: string) => ({
      id,
      document: { title, kind: 'markdown' as const, body: title },
    });
    const result = await repository.importSpaces([
      {
        id: ORDERED_SPACE_ID,
        document: { version: 1, title: 'Ordered cards' },
        cards: [card(third, 'Third'), card(second, 'Second'), card(first, 'First')],
      },
    ]);
    trackImported(result);
    expect(result.kind).toBe('imported');
    if (result.kind !== 'imported') throw new Error(result.message);

    const order = (stored: LoadedSpace) => ({
      ids: stored.snapshot.cards.map((card) => card.id),
      titles: stored.snapshot.cards.map((card) => card.document.title),
    });
    const ascending = { ids: [first, second, third], titles: ['First', 'Second', 'Third'] };

    // Two reads, not one: the import result comes from the read-back inside the
    // import transaction, and `loadSpace` is the same aggregate read outside
    // one. Only asserting the second would leave the in-transaction path — the
    // one place this read sees uncommitted rows — unordered and unnoticed.
    expect(order(result.spaces[0]!)).toEqual(ascending);

    const loaded = await repository.loadSpace(ORDERED_SPACE_ID);
    expect(loaded).toBeDefined();
    if (loaded === undefined) throw new Error('Imported space disappeared');
    expect(order(loaded)).toEqual(ascending);
  });

  it('rejects a commit for an unknown space', async () => {
    const missing: SpaceSnapshot = {
      id: MISSING_SPACE_ID,
      document: { version: 1, title: 'Missing space' },
      cards: [],
    };

    expect(await commitSpace(missing, 0n)).toEqual({
      kind: 'conflict',
      conflicts: [{ spaceId: MISSING_SPACE_ID, current: undefined }],
    });
    await expect(repository.loadSpace(MISSING_SPACE_ID)).resolves.toBeUndefined();
  });

  it('rejects a domain-invalid snapshot without changing the stored aggregate', async () => {
    await repository.importSpaces([snapshot]);
    const invalid: SpaceSnapshot = {
      ...snapshot,
      document: {
        ...snapshot.document,
        layouts: [
          {
            id: LAYOUT_ID,
            title: 'Owner',
            kind: 'positioned',
            positions: { [CARD_ID]: { x: 0, y: 0, open: false } },
            graphs: [
              {
                id: GRAPH_ID,
                title: 'Dangling graph',
                edges: [{ from: CARD_ID, to: MISSING_CARD_ID }],
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

  it('rejects a card owned by another space and rolls back the whole commit', async () => {
    await repository.importSpaces([snapshot, otherSnapshot]);
    const claimed: SpaceSnapshot = {
      ...snapshot,
      document: { ...snapshot.document, title: 'Must roll back' },
      cards: [...snapshot.cards, otherSnapshot.cards[0]!],
    };

    await expect(commitSpace(claimed, 0n)).resolves.toMatchObject({
      kind: 'aggregate-refused',
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

  it('serializes concurrent topology commits so the loser observes the complete winner', async () => {
    await repository.importSpaces([snapshot]);
    const firstRepository = new PostgresSpaceRepository(db);
    const secondRepository = new PostgresSpaceRepository(db);
    const firstTarget: SpaceSnapshot = {
      id: OTHER_SPACE_ID,
      document: { version: 1, title: 'First target' },
      cards: [],
    };
    const secondTarget: SpaceSnapshot = {
      id: CONCURRENT_SPACE_ID,
      document: { version: 1, title: 'Second target' },
      cards: [],
    };
    const firstLinked: SpaceSnapshot = {
      ...snapshot,
      cards: [
        ...snapshot.cards,
        {
          id: MISSING_CARD_ID,
          document: {
            title: 'First link',
            kind: 'space',
            spaceId: OTHER_SPACE_ID,
          },
        },
      ],
    };
    const secondLinked: SpaceSnapshot = {
      ...snapshot,
      cards: [
        ...snapshot.cards,
        {
          id: UNRESOLVED_CARD_ID,
          document: {
            title: 'Second link',
            kind: 'space',
            spaceId: CONCURRENT_SPACE_ID,
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
      metaSpaceId: SPACE_ID,
      spaces: [
        { snapshot: winningMeta, revision: 1n, exportedRevision: null },
        { snapshot: winningTarget, revision: 0n, exportedRevision: null },
      ],
    });
    await expect(repository.loadSpace(losingTargetId)).resolves.toBeUndefined();
  });

  it('rejects an existing space identity without changing stored content', async () => {
    await repository.importSpaces([snapshot, otherSnapshot]);
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

    // An identity rejection, not a conflict. Insert-only import runs no
    // optimistic revision operation, so there is no revision to disagree
    // about — the id was simply already taken. `conflict` is reserved for a
    // genuine race, proven by the concurrent-import test below.
    await expect(repository.importSpaces([reimported])).resolves.toEqual({
      kind: 'rejected',
      code: 'duplicate-identity',
      message: `Space ${SPACE_ID} already exists`,
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

  it('replaces every stored space and card in truncate mode', async () => {
    await repository.importSpaces([snapshot, otherSnapshot]);
    const replacement: SpaceSnapshot = {
      ...snapshot,
      document: { ...snapshot.document, title: 'Only remaining space' },
      cards: [snapshot.cards[0]!],
    };

    await expect(repository.importSpaces([replacement], 'truncate')).resolves.toEqual({
      kind: 'imported',
      spaces: [{ snapshot: replacement, revision: 0n, exportedRevision: null }],
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

  it('rolls back truncation and every earlier batch write when later validation fails', async () => {
    await repository.importSpaces([snapshot, otherSnapshot]);
    const replacement: SpaceSnapshot = {
      ...snapshot,
      document: { ...snapshot.document, title: 'Must roll back' },
    };
    const invalid: ImportSpace = {
      document: {
        version: 1,
        title: 'Invalid later space',
        layouts: [
          {
            title: 'Dangling layout',
            kind: 'positioned',
            positions: {},
            graphs: [
              {
                title: 'Dangling graph',
                edges: [{ from: UNRESOLVED_CARD_ID, to: MISSING_CARD_ID }],
              },
            ],
          },
        ],
      },
      cards: [],
    };

    await expect(
      repository.importSpaces([replacement, invalid], 'truncate'),
    ).resolves.toMatchObject({ kind: 'rejected', code: 'invalid-snapshot' });
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

  it('allocates every missing identity without rewriting explicit references', async () => {
    const result = await repository.importSpaces([mixedImport]);
    trackImported(result);
    expect(result.kind).toBe('imported');
    if (result.kind !== 'imported') {
      throw new Error(result.message);
    }

    const stored = result.spaces[0]!;
    const layout = stored.snapshot.document.layouts?.[0];
    expect(layout).toBeDefined();
    if (layout === undefined) throw new Error('Generated layout was not returned');
    const graph = layout.graphs[0]!;
    const generatedCard = stored.snapshot.cards.find(
      ({ id }) => id !== MIXED_FIRST_CARD_ID && id !== MIXED_SECOND_CARD_ID,
    );
    expect(generatedCard).toBeDefined();
    if (generatedCard === undefined) throw new Error('Generated card was not returned');
    const generatedIds = [stored.snapshot.id, generatedCard.id, graph.id, layout.id];

    for (const id of generatedIds) expect(uuidSchema.safeParse(id).success).toBe(true);
    expect(new Set(generatedIds).size).toBe(4);
    expect(generatedIds).not.toContain(MIXED_FIRST_CARD_ID);
    expect(generatedIds).not.toContain(MIXED_SECOND_CARD_ID);
    expect(new Set(stored.snapshot.cards.map(({ id }) => id))).toEqual(
      new Set([MIXED_FIRST_CARD_ID, MIXED_SECOND_CARD_ID, generatedCard.id]),
    );
    expect(graph.edges).toEqual([{ from: MIXED_FIRST_CARD_ID, to: MIXED_SECOND_CARD_ID }]);
    expect(layout.positions).toEqual({
      [MIXED_FIRST_CARD_ID]: { x: 40, y: 80, open: false },
      [MIXED_SECOND_CARD_ID]: { x: 300, y: 80, open: false },
    });
    await expect(repository.loadSpace(stored.snapshot.id)).resolves.toEqual(stored);
  });

  it('mints a fresh identity per import for every id the input omits', async () => {
    const first = await repository.importSpaces([idlessImport(ALL_IDLESS_CARD_ID)]);
    trackImported(first);
    expect(first.kind).toBe('imported');
    if (first.kind !== 'imported') {
      throw new Error(first.message);
    }

    const second = await repository.importSpaces([idlessImport(SECOND_IDLESS_CARD_ID)]);
    trackImported(second);
    expect(second.kind).toBe('imported');
    if (second.kind !== 'imported') {
      throw new Error(second.message);
    }

    // The three the input omitted, and the graph is reached through its owner
    // because that is where the minting now happens. The card id is deliberately
    // not among them: it was supplied, so asserting it was minted would assert
    // the opposite of what the fixture says.
    const minted = (stored: LoadedSpace): UUID[] => {
      const layout = stored.snapshot.document.layouts![0]!;
      return [stored.snapshot.id, layout.id, layout.graphs[0]!.id];
    };
    const firstIds = minted(first.spaces[0]!);
    const secondIds = minted(second.spaces[0]!);
    for (const id of [...firstIds, ...secondIds]) {
      expect(uuidSchema.safeParse(id).success).toBe(true);
    }
    // Six, so nothing is memoized across imports of identical structure.
    expect(new Set([...firstIds, ...secondIds]).size).toBe(6);
    expect([...firstIds, ...secondIds]).not.toContain(ALL_IDLESS_CARD_ID);
    expect([...firstIds, ...secondIds]).not.toContain(SECOND_IDLESS_CARD_ID);
  });

  it('rejects reuse of explicit cards by a generated space and rolls back the batch', async () => {
    await repository.importSpaces([snapshot]);
    const first = await repository.importSpaces([mixedImport]);
    trackImported(first);
    expect(first.kind).toBe('imported');
    if (first.kind !== 'imported') {
      throw new Error(first.message);
    }
    const firstStored = first.spaces[0]!;
    const catalogBefore = await repository.listSpaces();

    const second = await repository.importSpaces([otherSnapshot, mixedImport]);
    trackImported(second);

    expect(second).toMatchObject({ kind: 'rejected', code: 'card-ownership' });
    if (second.kind !== 'rejected') throw new Error('Conflicting import was not rejected');
    expect(second.message).toContain(MIXED_FIRST_CARD_ID);
    await expect(repository.listSpaces()).resolves.toEqual(catalogBefore);
    await expect(repository.loadSpace(OTHER_SPACE_ID)).resolves.toBeUndefined();
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
        version: 1,
        title: 'Invalid generated space',
        layouts: [
          {
            title: 'Unresolved layout',
            kind: 'positioned',
            positions: {},
            graphs: [
              {
                title: 'Unresolved graph',
                edges: [{ from: UNRESOLVED_CARD_ID, to: MISSING_CARD_ID }],
              },
            ],
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

  it('rolls back earlier batch inserts when a later space identity already exists', async () => {
    await repository.importSpaces([snapshot]);
    const collidingSnapshot: SpaceSnapshot = {
      ...snapshot,
      document: { ...snapshot.document, title: 'Must not replace stored content' },
    };

    await expect(repository.importSpaces([otherSnapshot, collidingSnapshot])).resolves.toEqual({
      kind: 'rejected',
      code: 'duplicate-identity',
      message: `Space ${SPACE_ID} already exists`,
    });
    await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual({
      snapshot,
      revision: 0n,
      exportedRevision: null,
    });
    await expect(repository.loadSpace(OTHER_SPACE_ID)).resolves.toBeUndefined();
  });

  it('imports a graph id already nested in another stored space', async () => {
    // A graph id is unique across the space that holds it and no wider — its
    // owner is one layout (ADR 0040), and the flatten a space-subject view draws
    // is what makes the space the scope (ADR 0045). Two spaces reusing one is
    // therefore fine.
    // There is no graphs table and no layouts table (ADR 0030 keeps both nested),
    // and every query in the repository is by space id or card id, so no lookup
    // anywhere can be made ambiguous by the reuse below. Space and card ids are
    // rows and stay globally unique — enforced by their primary keys, which the
    // duplicate-identity and card-ownership tests cover.
    //
    // Guards a decision, not a bug: scanning every stored document to reject
    // this would cost a full table read per import and protect nothing.
    const first: SpaceSnapshot = {
      id: SPACE_ID,
      document: {
        version: 1,
        title: 'First space',
        layouts: [
          {
            id: LAYOUT_ID,
            title: 'Owner',
            kind: 'positioned',
            positions: {
              [CARD_ID]: { x: 0, y: 0, open: false },
              [OMITTED_CARD_ID]: { x: 300, y: 0, open: false },
            },
            graphs: [
              {
                id: GRAPH_ID,
                title: 'Shared graph id',
                edges: [{ from: CARD_ID, to: OMITTED_CARD_ID }],
              },
            ],
          },
        ],
      },
      cards: [
        { id: CARD_ID, document: { title: 'From', kind: 'markdown', body: 'First.' } },
        { id: OMITTED_CARD_ID, document: { title: 'To', kind: 'markdown', body: 'First.' } },
      ],
    };
    const second: SpaceSnapshot = {
      id: OTHER_SPACE_ID,
      document: {
        version: 1,
        title: 'Second space',
        layouts: [
          {
            id: LAYOUT_ID,
            title: 'Owner',
            kind: 'positioned',
            positions: {
              [OTHER_CARD_ID]: { x: 0, y: 0, open: false },
              [MIXED_FIRST_CARD_ID]: { x: 300, y: 0, open: false },
            },
            graphs: [
              {
                id: GRAPH_ID,
                title: 'Same graph id, other space',
                edges: [{ from: OTHER_CARD_ID, to: MIXED_FIRST_CARD_ID }],
              },
            ],
          },
        ],
      },
      cards: [
        { id: OTHER_CARD_ID, document: { title: 'From', kind: 'markdown', body: 'Second.' } },
        { id: MIXED_FIRST_CARD_ID, document: { title: 'To', kind: 'markdown', body: 'Second.' } },
      ],
    };

    expect((await repository.importSpaces([first])).kind).toBe('imported');
    expect((await repository.importSpaces([second])).kind).toBe('imported');

    await expect(repository.loadSpace(SPACE_ID)).resolves.toMatchObject({
      snapshot: {
        document: { layouts: [{ graphs: [{ id: GRAPH_ID, title: 'Shared graph id' }] }] },
      },
    });
    await expect(repository.loadSpace(OTHER_SPACE_ID)).resolves.toMatchObject({
      snapshot: {
        document: {
          layouts: [{ graphs: [{ id: GRAPH_ID, title: 'Same graph id, other space' }] }],
        },
      },
    });
  });

  it('imports one batch whose Spaces share a graph id', async () => {
    // The same two Spaces as the test above, in one batch instead of two.
    // Splitting a batch must not change what is accepted: graph ids resolve only
    // within their owning Space, so the batch boundary is not a scope.
    const first: SpaceSnapshot = {
      id: SPACE_ID,
      document: {
        version: 1,
        title: 'First space',
        layouts: [
          {
            id: LAYOUT_ID,
            title: 'Owner',
            kind: 'positioned',
            positions: {
              [CARD_ID]: { x: 0, y: 0, open: false },
              [OMITTED_CARD_ID]: { x: 300, y: 0, open: false },
            },
            graphs: [
              {
                id: GRAPH_ID,
                title: 'Shared graph id',
                edges: [{ from: CARD_ID, to: OMITTED_CARD_ID }],
              },
            ],
          },
        ],
      },
      cards: [
        { id: CARD_ID, document: { title: 'From', kind: 'markdown', body: 'First.' } },
        { id: OMITTED_CARD_ID, document: { title: 'To', kind: 'markdown', body: 'First.' } },
      ],
    };
    const second: SpaceSnapshot = {
      id: OTHER_SPACE_ID,
      document: {
        version: 1,
        title: 'Second space',
        layouts: [
          {
            id: LAYOUT_ID,
            title: 'Owner',
            kind: 'positioned',
            positions: {
              [OTHER_CARD_ID]: { x: 0, y: 0, open: false },
              [MIXED_FIRST_CARD_ID]: { x: 300, y: 0, open: false },
            },
            graphs: [
              {
                id: GRAPH_ID,
                title: 'Same graph id',
                edges: [{ from: OTHER_CARD_ID, to: MIXED_FIRST_CARD_ID }],
              },
            ],
          },
        ],
      },
      cards: [
        { id: OTHER_CARD_ID, document: { title: 'From', kind: 'markdown', body: 'Second.' } },
        { id: MIXED_FIRST_CARD_ID, document: { title: 'To', kind: 'markdown', body: 'Second.' } },
      ],
    };

    expect((await repository.importSpaces([first, second])).kind).toBe('imported');
  });

  it('imports a Space whose graph id equals one of its card ids', async () => {
    // Entity kinds do not share an identity space. Intake checks each kind
    // separately — cards among cards, graphs among graphs — so a UUID naming
    // both a card and a graph names two different things unambiguously.
    const shared: SpaceSnapshot = {
      id: SPACE_ID,
      document: {
        version: 1,
        title: 'Graph id equals card id',
        layouts: [
          {
            id: LAYOUT_ID,
            title: 'Owner',
            kind: 'positioned',
            positions: {
              [CARD_ID]: { x: 0, y: 0, open: false },
              [OMITTED_CARD_ID]: { x: 300, y: 0, open: false },
            },
            graphs: [
              {
                id: CARD_ID,
                title: 'Graph named like a card',
                edges: [{ from: CARD_ID, to: OMITTED_CARD_ID }],
              },
            ],
          },
        ],
      },
      cards: [
        { id: CARD_ID, document: { title: 'From', kind: 'markdown', body: 'Shared.' } },
        { id: OMITTED_CARD_ID, document: { title: 'To', kind: 'markdown', body: 'Shared.' } },
      ],
    };

    expect((await repository.importSpaces([shared])).kind).toBe('imported');
  });

  it('rejects a batch whose Spaces claim the same card id', async () => {
    // Cards are rows, so their ids must stay unique across the database. Caught
    // before any write rather than as a late primary-key violation.
    const claimant: SpaceSnapshot = {
      id: OTHER_SPACE_ID,
      document: { version: 1, title: 'Claims the first space card' },
      cards: [{ id: CARD_ID, document: { title: 'Taken', kind: 'markdown', body: 'Taken.' } }],
    };

    await expect(repository.importSpaces([snapshot, claimant])).resolves.toMatchObject({
      kind: 'rejected',
      code: 'duplicate-identity',
    });
    await expect(repository.loadSpace(SPACE_ID)).resolves.toBeUndefined();
    await expect(repository.loadSpace(OTHER_SPACE_ID)).resolves.toBeUndefined();
  });

  it('rejects two layouts owning a graph under one id', async () => {
    // Domain intake's job, not the batch check's — and the reason the batch check
    // does not need to look at graph ids at all. A graph id is unique across the
    // space although one layout owns it (ADR 0045), so the collision worth
    // catching is the one that spans owners.
    const collidingGraphs: SpaceSnapshot = {
      ...snapshot,
      document: {
        ...snapshot.document,
        layouts: [
          {
            id: LAYOUT_ID,
            title: 'First owner',
            kind: 'positioned',
            positions: {
              [CARD_ID]: { x: 0, y: 0, open: false },
              [OMITTED_CARD_ID]: { x: 300, y: 0, open: false },
            },
            graphs: [
              { id: GRAPH_ID, title: 'First', edges: [{ from: CARD_ID, to: OMITTED_CARD_ID }] },
            ],
          },
          {
            id: OTHER_LAYOUT_ID,
            title: 'Second owner',
            kind: 'positioned',
            positions: {
              [CARD_ID]: { x: 0, y: 0, open: false },
              [OMITTED_CARD_ID]: { x: 300, y: 0, open: false },
            },
            graphs: [
              { id: GRAPH_ID, title: 'Second', edges: [{ from: OMITTED_CARD_ID, to: CARD_ID }] },
            ],
          },
        ],
      },
    };

    await expect(repository.importSpaces([collidingGraphs])).resolves.toMatchObject({
      kind: 'rejected',
      code: 'invalid-snapshot',
    });
    await expect(repository.loadSpace(SPACE_ID)).resolves.toBeUndefined();
  });

  it('rejects the losing identity when another import creates the space first', async () => {
    // Exactly one wins; the loser is an identity rejection, not a conflict.
    //
    // The distinction insert-only import might have drawn here — "the id existed
    // before I began" versus "a rival created it while I ran" — is not
    // well-defined under PostgreSQL's default READ COMMITTED isolation: whether
    // the loser observes the winner's row depends purely on commit timing, so
    // classifying on it produces a nondeterministic result for identical inputs.
    // Both are the same fact anyway — the identity is taken — and insert-only
    // import compares no revisions, so neither is a revision conflict.
    const firstRepository = new PostgresSpaceRepository(db);
    const secondRepository = new PostgresSpaceRepository(db);
    const firstSnapshot: SpaceSnapshot = {
      id: CONCURRENT_SPACE_ID,
      document: { version: 1, title: 'First concurrent insert' },
      cards: [],
    };
    const secondSnapshot: SpaceSnapshot = {
      ...firstSnapshot,
      document: { ...firstSnapshot.document, title: 'Second concurrent insert' },
    };

    const results = await Promise.all([
      firstRepository.importSpaces([firstSnapshot]),
      secondRepository.importSpaces([secondSnapshot]),
    ]);

    expect(results.filter((result) => result.kind === 'imported')).toHaveLength(1);
    expect(results).toContainEqual({
      kind: 'rejected',
      code: 'duplicate-identity',
      message: `Space ${CONCURRENT_SPACE_ID} already exists`,
    });
    await expect(repository.loadSpace(CONCURRENT_SPACE_ID)).resolves.toMatchObject({
      revision: 0n,
    });
  });
});
