import { uuidSchema, type ImportSpace, type SpaceSnapshot, type UUID } from '@project/core';
import type { LoadedSpace } from '@project/persistence';
import { afterAll, afterEach, describe, expect, expectTypeOf, it } from 'vitest';
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
  for (const space of await db.orm.public.Space.all()) {
    await db.orm.public.Card.where({ spaceId: space.id }).deleteAll();
    await db.orm.public.Space.where({ id: space.id }).delete();
  }
};

/*
 * Declared before the suite below so it runs before it, and therefore before the
 * `afterAll` that closes the connection. The harness owns a clean database at
 * both ends rather than tracking the ids it created: half these cases are about
 * what a rejected batch leaves behind, and a per-id cleanup list would be
 * written from the same assumption the test is checking.
 */
spaceRepositoryContract('PostgresSpaceRepository', async () => {
  await clearHyperContent();
  return { repository: new PostgresSpaceRepository(db), close: clearHyperContent };
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
const ORDERED_CARD_IDS = [
  uuidSchema.parse('eeeeeeee-1111-4eee-8eee-eeeeeeeeeeee'),
  uuidSchema.parse('eeeeeeee-2222-4eee-8eee-eeeeeeeeeeee'),
  uuidSchema.parse('eeeeeeee-3333-4eee-8eee-eeeeeeeeeeee'),
] as const;

const snapshot: SpaceSnapshot = {
  id: SPACE_ID,
  document: {
    version: 2,
    title: 'Repository space',
    graphs: [],
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
    graphs: [],
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
    graphs: [
      {
        title: 'Explicit card graph',
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
    graphs: [],
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

  it('records the projected revision without hiding a concurrent edit', async () => {
    await repository.importSpaces([snapshot]);
    const exported = await repository.loadSpace(SPACE_ID);
    expect(exported).toBeDefined();
    if (exported === undefined) throw new Error('Imported space disappeared');
    const changed: SpaceSnapshot = {
      ...snapshot,
      document: { ...snapshot.document, title: 'Edited during export' },
    };

    await expect(repository.commitSpace(changed, exported.revision)).resolves.toEqual({
      kind: 'committed',
      revision: 1n,
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
        document: { version: 2, title: 'Ordered cards', graphs: [] },
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
      document: { version: 2, title: 'Missing space', graphs: [] },
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
        graphs: [
          {
            id: GRAPH_ID,
            title: 'Dangling graph',
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
        version: 2,
        title: 'Invalid later space',
        graphs: [
          {
            title: 'Dangling graph',
            edges: [{ from: UNRESOLVED_CARD_ID, to: MISSING_CARD_ID }],
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
    const graph = stored.snapshot.document.graphs[0]!;
    const layout = stored.snapshot.document.layouts?.[0];
    expect(layout).toBeDefined();
    if (layout === undefined) throw new Error('Generated layout was not returned');
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
    expect(layout.positions).toEqual({ [MIXED_FIRST_CARD_ID]: { x: 40, y: 80 } });
    await expect(repository.loadSpace(stored.snapshot.id)).resolves.toEqual(stored);
  });

  it('allocates disjoint identities for repeated all-id-less imports', async () => {
    const first = await repository.importSpaces([allIdlessImport]);
    trackImported(first);
    expect(first.kind).toBe('imported');
    if (first.kind !== 'imported') {
      throw new Error(first.message);
    }

    const second = await repository.importSpaces([allIdlessImport]);
    trackImported(second);
    expect(second.kind).toBe('imported');
    if (second.kind !== 'imported') {
      throw new Error(second.message);
    }

    const identities = (stored: LoadedSpace): UUID[] => [
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
        version: 2,
        title: 'Invalid generated space',
        graphs: [
          {
            title: 'Unresolved graph',
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
    // Graph and layout ids are scoped to the space document that carries them.
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
        version: 2,
        title: 'First space',
        graphs: [
          {
            id: GRAPH_ID,
            title: 'Shared graph id',
            edges: [{ from: CARD_ID, to: OMITTED_CARD_ID }],
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
        version: 2,
        title: 'Second space',
        graphs: [
          {
            id: GRAPH_ID,
            title: 'Same graph id, other space',
            edges: [{ from: OTHER_CARD_ID, to: MIXED_FIRST_CARD_ID }],
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
      snapshot: { document: { graphs: [{ id: GRAPH_ID, title: 'Shared graph id' }] } },
    });
    await expect(repository.loadSpace(OTHER_SPACE_ID)).resolves.toMatchObject({
      snapshot: { document: { graphs: [{ id: GRAPH_ID, title: 'Same graph id, other space' }] } },
    });
  });

  it('imports one batch whose Spaces share a graph id', async () => {
    // The same two Spaces as the test above, in one batch instead of two.
    // Splitting a batch must not change what is accepted: graph ids resolve only
    // within their owning Space, so the batch boundary is not a scope.
    const first: SpaceSnapshot = {
      id: SPACE_ID,
      document: {
        version: 2,
        title: 'First space',
        graphs: [
          {
            id: GRAPH_ID,
            title: 'Shared graph id',
            edges: [{ from: CARD_ID, to: OMITTED_CARD_ID }],
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
        version: 2,
        title: 'Second space',
        graphs: [
          {
            id: GRAPH_ID,
            title: 'Same graph id',
            edges: [{ from: OTHER_CARD_ID, to: MIXED_FIRST_CARD_ID }],
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
        version: 2,
        title: 'Graph id equals card id',
        graphs: [
          {
            id: CARD_ID,
            title: 'Graph named like a card',
            edges: [{ from: CARD_ID, to: OMITTED_CARD_ID }],
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
      document: { version: 2, title: 'Claims the first space card', graphs: [] },
      cards: [{ id: CARD_ID, document: { title: 'Taken', kind: 'markdown', body: 'Taken.' } }],
    };

    await expect(repository.importSpaces([snapshot, claimant])).resolves.toMatchObject({
      kind: 'rejected',
      code: 'duplicate-identity',
    });
    await expect(repository.loadSpace(SPACE_ID)).resolves.toBeUndefined();
    await expect(repository.loadSpace(OTHER_SPACE_ID)).resolves.toBeUndefined();
  });

  it('rejects two graphs sharing an id within one Space', async () => {
    // Domain intake's job, not the batch check's — and the reason the batch check
    // does not need to look at graph ids at all.
    const collidingGraphs: SpaceSnapshot = {
      ...snapshot,
      document: {
        ...snapshot.document,
        graphs: [
          { id: GRAPH_ID, title: 'First', edges: [{ from: CARD_ID, to: OMITTED_CARD_ID }] },
          { id: GRAPH_ID, title: 'Second', edges: [{ from: OMITTED_CARD_ID, to: CARD_ID }] },
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
      document: { version: 2, title: 'First concurrent insert', graphs: [] },
      cards: [],
    };
    const secondSnapshot: SpaceSnapshot = {
      ...firstSnapshot,
      document: { ...firstSnapshot.document, title: 'Second concurrent insert', graphs: [] },
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
