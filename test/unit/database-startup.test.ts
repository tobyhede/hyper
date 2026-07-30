import { uuidSchema } from '@project/core';
import { describe, expect, it } from 'vitest';
import { openDatabaseSelection, resolveDatabaseStartup } from '../../src/startup/database-startup';
import type { StoredSpace } from '../../src/persistence/space-repository';
import { MemorySpaceRepository } from '../support/memory-space-repository';

const SPACE_ID = uuidSchema.parse('11111111-1111-4111-8111-111111111111');
const OTHER_SPACE_ID = uuidSchema.parse('22222222-2222-4222-8222-222222222222');
const CARD_ID = uuidSchema.parse('33333333-3333-4333-8333-333333333333');
const OTHER_CARD_ID = uuidSchema.parse('44444444-4444-4444-8444-444444444444');

const storedSpace = (
  revision: bigint,
  id = SPACE_ID,
  cardId = CARD_ID,
  title = 'Existing space',
): StoredSpace => ({
  snapshot: {
    id,
    document: { version: 2, title, routes: [] },
    cards: [
      {
        id: cardId,
        document: { title: 'Existing card', kind: 'markdown', body: '' },
      },
    ],
  },
  revision,
  exportedRevision: null,
});

describe('openDatabaseSelection', () => {
  it('opens the space selected by its UUID', async () => {
    const selected = storedSpace(7n, OTHER_SPACE_ID, OTHER_CARD_ID, 'Other space');
    const repository = new MemorySpaceRepository([storedSpace(4n), selected]);

    const result = await openDatabaseSelection(repository, OTHER_SPACE_ID);

    expect(result).toEqual({ kind: 'opened', space: selected });
  });

  it('rejects a selected UUID that disappeared without creating a fallback', async () => {
    const repository = new MemorySpaceRepository([
      storedSpace(7n, OTHER_SPACE_ID, OTHER_CARD_ID, 'Other space'),
    ]);
    await repository.importSpaces([], 'truncate');

    await expect(openDatabaseSelection(repository, OTHER_SPACE_ID)).rejects.toThrow(OTHER_SPACE_ID);
    await expect(repository.listSpaces()).resolves.toEqual([]);
  });
});

describe('resolveDatabaseStartup', () => {
  it('creates and opens the normal new space when the database is empty', async () => {
    const repository = new MemorySpaceRepository();

    const result = await resolveDatabaseStartup(repository);

    expect(result.kind).toBe('opened');
    if (result.kind !== 'opened') throw new Error('Expected the new space to open');
    expect(uuidSchema.safeParse(result.space.snapshot.id).success).toBe(true);
    const cardId = result.space.snapshot.cards[0]?.id;
    expect(uuidSchema.safeParse(cardId).success).toBe(true);
    expect(result.space).toEqual({
      snapshot: {
        id: result.space.snapshot.id,
        document: { version: 2, title: 'New space', routes: [] },
        cards: [
          {
            id: cardId,
            document: { title: 'Start here', kind: 'markdown', body: '' },
          },
        ],
      },
      revision: 0n,
      exportedRevision: null,
    });
    await expect(repository.loadSpace(result.space.snapshot.id)).resolves.toEqual(result.space);
  });

  it('opens the only stored space without losing its revision precision', async () => {
    const existing = storedSpace(BigInt(Number.MAX_SAFE_INTEGER) + 1n);
    const repository = new MemorySpaceRepository([existing]);

    const result = await resolveDatabaseStartup(repository);

    expect(result).toEqual({ kind: 'opened', space: existing });
  });

  it('offers the complete catalog when several spaces are stored', async () => {
    const repository = new MemorySpaceRepository([
      storedSpace(4n),
      storedSpace(7n, OTHER_SPACE_ID, OTHER_CARD_ID, 'Other space'),
    ]);

    const result = await resolveDatabaseStartup(repository);

    expect(result).toEqual({
      kind: 'selection',
      spaces: [
        { id: SPACE_ID, title: 'Existing space' },
        { id: OTHER_SPACE_ID, title: 'Other space' },
      ],
    });
  });
});
