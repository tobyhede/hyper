import { uuidSchema, type SpaceSnapshot } from '@project/core';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { PostgresSpaceRepository } from '../../src/persistence/postgres-space-repository';
import { db } from '../../src/prisma/db';

const SPACE_ID = uuidSchema.parse('11111111-1111-4111-8111-111111111111');
const CARD_ID = uuidSchema.parse('22222222-2222-4222-8222-222222222222');
const OMITTED_CARD_ID = uuidSchema.parse('33333333-3333-4333-8333-333333333333');
const MISSING_SPACE_ID = uuidSchema.parse('44444444-4444-4444-8444-444444444444');
const ROUTE_ID = uuidSchema.parse('55555555-5555-4555-8555-555555555555');
const MISSING_CARD_ID = uuidSchema.parse('66666666-6666-4666-8666-666666666666');
const OTHER_SPACE_ID = uuidSchema.parse('77777777-7777-4777-8777-777777777777');
const OTHER_CARD_ID = uuidSchema.parse('88888888-8888-4888-8888-888888888888');

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

describe('PostgresSpaceRepository', () => {
  const repository = new PostgresSpaceRepository(db);

  afterEach(async () => {
    await db.orm.public.Card.where({ spaceId: SPACE_ID }).delete();
    await db.orm.public.Card.where({ spaceId: OTHER_SPACE_ID }).delete();
    await db.orm.public.Space.where({ id: SPACE_ID }).delete();
    await db.orm.public.Space.where({ id: OTHER_SPACE_ID }).delete();
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
    if (imported.kind !== 'imported') throw new Error(imported.message);
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

  it('preserves export metadata while advancing the aggregate revision', async () => {
    await repository.importSpaces([snapshot]);
    await db.orm.public.Space.where({ id: SPACE_ID }).update({ exportedRevision: 0 });
    const changed: SpaceSnapshot = {
      ...snapshot,
      cards: [
        {
          ...snapshot.cards[0]!,
          document: {
            ...snapshot.cards[0]!.document,
            title: 'Changed after export',
          },
        },
        snapshot.cards[1]!,
      ],
    };

    await repository.commitSpace(changed, 0n);

    await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual({
      snapshot: changed,
      revision: 1n,
      exportedRevision: 0n,
    });
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

  it('does not narrow an unsafe bigint revision to a JavaScript number', async () => {
    await repository.importSpaces([snapshot]);
    const unsafeRevision = BigInt(Number.MAX_SAFE_INTEGER) + 1n;

    await expect(repository.commitSpace(snapshot, unsafeRevision)).rejects.toThrow(
      `Revision ${unsafeRevision} cannot be represented safely by Prisma Next 0.16.0`,
    );
    await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual({
      snapshot,
      revision: 0n,
      exportedRevision: null,
    });
  });
});
