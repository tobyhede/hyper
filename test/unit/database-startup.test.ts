import { uuidSchema, type ImportSpace, type SpaceSnapshot, type UUID } from '@project/core';
import { describe, expect, it } from 'vitest';
import { openDatabaseSelection, resolveDatabaseStartup } from '../../src/startup/database-startup';
import type {
  ImportMode,
  RepositoryCommitResult,
  RepositoryImportResult,
  SpaceRepository,
  SpaceSummary,
  StoredSpace,
} from '../../src/persistence/space-repository';
import { MemorySpaceRepository } from '../support/memory-space-repository';

const SPACE_ID = uuidSchema.parse('11111111-1111-4111-8111-111111111111');
const OTHER_SPACE_ID = uuidSchema.parse('22222222-2222-4222-8222-222222222222');
const CARD_ID = uuidSchema.parse('33333333-3333-4333-8333-333333333333');
const OTHER_CARD_ID = uuidSchema.parse('44444444-4444-4444-8444-444444444444');
const THIRD_SPACE_ID = uuidSchema.parse('55555555-5555-4555-8555-555555555555');
const THIRD_CARD_ID = uuidSchema.parse('66666666-6666-4666-8666-666666666666');

class PersistenceOwnedSpaceIdRepository implements SpaceRepository {
  readonly #memory = new MemorySpaceRepository();

  listSpaces(): Promise<readonly SpaceSummary[]> {
    return this.#memory.listSpaces();
  }

  loadSpace(id: UUID): Promise<StoredSpace | undefined> {
    return this.#memory.loadSpace(id);
  }

  commitSpace(snapshot: SpaceSnapshot, expectedRevision: bigint): Promise<RepositoryCommitResult> {
    return this.#memory.commitSpace(snapshot, expectedRevision);
  }

  importSpaces(input: readonly ImportSpace[], mode: ImportMode): Promise<RepositoryImportResult> {
    const [space] = input;
    if (space === undefined || input.length !== 1) {
      return Promise.resolve({
        kind: 'rejected',
        code: 'invalid-snapshot',
        message: 'Expected exactly one new Space',
      });
    }
    if (space.id !== undefined) {
      return Promise.resolve({
        kind: 'rejected',
        code: 'invalid-snapshot',
        message: 'The repository owns the new Space identity',
      });
    }
    if (space.cards.some((card) => card.id === undefined)) {
      return Promise.resolve({
        kind: 'rejected',
        code: 'invalid-snapshot',
        message: 'Card identities must already be assigned',
      });
    }

    return this.#memory.importSpaces([{ ...space, id: SPACE_ID }], mode);
  }
}

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

  it('rejects a selected UUID that disappeared without falling back to another space', async () => {
    const remaining = storedSpace(0n);
    const selected = storedSpace(7n, OTHER_SPACE_ID, OTHER_CARD_ID, 'Other space');
    const repository = new MemorySpaceRepository([remaining, selected]);
    await repository.importSpaces([remaining.snapshot], 'truncate');

    await expect(openDatabaseSelection(repository, OTHER_SPACE_ID)).rejects.toThrow(OTHER_SPACE_ID);
    await expect(repository.listSpaces()).resolves.toEqual([
      { id: SPACE_ID, title: 'Existing space' },
    ]);
    await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual(remaining);
  });
});

describe('resolveDatabaseStartup', () => {
  it('leaves the new Space identity for the repository to assign', async () => {
    const repository = new PersistenceOwnedSpaceIdRepository();

    const result = await resolveDatabaseStartup(repository);

    expect(result.kind).toBe('opened');
    if (result.kind !== 'opened') throw new Error('Expected the new space to open');
    expect(result.space.snapshot.id).toBe(SPACE_ID);
    expect(uuidSchema.safeParse(result.space.snapshot.cards[0]?.id).success).toBe(true);
  });

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

  it('rejects an empty import without opening an unrelated stored space', async () => {
    const unrelated = storedSpace(4n);
    const repository = new MemorySpaceRepository([unrelated]);

    await expect(resolveDatabaseStartup(repository, [])).rejects.toThrow(
      'Database import returned no spaces',
    );
    await expect(repository.listSpaces()).resolves.toEqual([
      { id: SPACE_ID, title: 'Existing space' },
    ]);
  });

  it('opens the one imported space by its UUID when unrelated spaces exist', async () => {
    const unrelated = storedSpace(4n);
    const stored = storedSpace(
      BigInt(Number.MAX_SAFE_INTEGER) + 1n,
      OTHER_SPACE_ID,
      OTHER_CARD_ID,
      'Fresh imported space',
    );
    const imported = storedSpace(0n, OTHER_SPACE_ID, OTHER_CARD_ID, 'Stale imported space');
    const repository = new MemorySpaceRepository([unrelated, stored]);

    const result = await resolveDatabaseStartup(repository, [imported]);

    expect(result).toEqual({ kind: 'opened', space: stored });
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

  it('offers the fresh complete catalog after several spaces are imported', async () => {
    const unrelated = storedSpace(4n);
    const firstImported = storedSpace(0n, OTHER_SPACE_ID, OTHER_CARD_ID, 'First imported');
    const secondImported = storedSpace(0n, THIRD_SPACE_ID, THIRD_CARD_ID, 'Second imported');
    const repository = new MemorySpaceRepository([unrelated, firstImported, secondImported]);

    const result = await resolveDatabaseStartup(repository, [
      {
        ...firstImported,
        snapshot: {
          ...firstImported.snapshot,
          document: { ...firstImported.snapshot.document, title: 'Stale first title' },
        },
      },
      secondImported,
    ]);

    expect(result).toEqual({
      kind: 'selection',
      spaces: [
        { id: SPACE_ID, title: 'Existing space' },
        { id: OTHER_SPACE_ID, title: 'First imported' },
        { id: THIRD_SPACE_ID, title: 'Second imported' },
      ],
    });
  });
});
