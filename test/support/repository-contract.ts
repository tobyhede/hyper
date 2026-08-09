import { uuidSchema, type ImportSpace, type SpaceSnapshot, type UUID } from '@project/core';
import { expect, it } from 'vitest';
import type { SpaceRepository } from '../../src/persistence/space-repository';

/**
 * The behaviour every `SpaceRepository` owes its callers, run against each
 * implementation rather than restated per adapter.
 *
 * `MemorySpaceRepository` is a hand-written parallel implementation of
 * production classification policy, maintained by reading the PostgreSQL
 * adapter. That is exactly the arrangement a shared suite exists to replace:
 * whatever the two disagree about, they now disagree in front of the same
 * assertions.
 *
 * It sits here rather than behind `@project/persistence/test-support`, where the
 * `SpaceBackend` contract lives, because `SpaceRepository` is declared in `src/`
 * — `importSpaces` and `markExported` are CLI capability and stay out of the
 * browser-safe package. `packages/persistence` may not import `src/` (its
 * tsconfig `paths` resolve only `core` and `graph`, and ESLint blocks the
 * relative escape), and both consumers of this suite are root tests, so there
 * is no package boundary to publish across.
 *
 * Deliberately absent, because the two implementations do not genuinely share
 * them:
 *
 *  - **The order `listSpaces` returns.** Both sort ascending by id, but one
 *    through `String.localeCompare` and the other through PostgreSQL's ordering
 *    of the `uuid` type. Those agree for canonical lowercase UUIDs by a property
 *    of ICU collation, not by anything either implementation promises, so the
 *    contract compares catalogs as sets. The Cards *inside* a Space are a
 *    different matter: both order them by id on every read, by codepoint over
 *    the canonical text on one side and by the `uuid` bytes on the other, which
 *    are the same comparison — so the whole-snapshot `toEqual` comparisons below
 *    pin that order rather than tolerating it.
 *  - **Rejection messages**, except the three both implementations produce
 *    character-for-character. The codes are the contract; the prose is not.
 *  - **Transactional isolation.** The concurrent-insert race and the
 *    one-statement aggregate read are PostgreSQL behaviour a `Map` cannot have,
 *    and they stay in the integration suite.
 */
const SPACE_ID = uuidSchema.parse('c0000000-0000-4000-8000-000000000001');
const OTHER_SPACE_ID = uuidSchema.parse('c0000000-0000-4000-8000-000000000002');
const MISSING_SPACE_ID = uuidSchema.parse('c0000000-0000-4000-8000-000000000003');
const CARD_ID = uuidSchema.parse('c0000000-0000-4000-8000-000000000010');
const SECOND_CARD_ID = uuidSchema.parse('c0000000-0000-4000-8000-000000000011');
const OTHER_CARD_ID = uuidSchema.parse('c0000000-0000-4000-8000-000000000012');
const MISSING_CARD_ID = uuidSchema.parse('c0000000-0000-4000-8000-000000000013');
const GRAPH_ID = uuidSchema.parse('c0000000-0000-4000-8000-000000000020');

const card = (id: UUID, title: string) => ({
  id,
  document: { title, kind: 'markdown' as const, body: title },
});

const space = (id: UUID, title: string, cardIds: readonly UUID[]): SpaceSnapshot => ({
  id,
  document: { version: 2, title, graphs: [] },
  cards: cardIds.map((cardId) => card(cardId, `${title} card`)),
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

export interface RepositoryHarness {
  repository: SpaceRepository;
  close(): Promise<void>;
}

/**
 * Seeding runs through `importSpaces` rather than through a constructor
 * argument, unlike the `SpaceBackend` contract. A repository backed by
 * PostgreSQL has no other door: rows only arrive by import or commit, and both
 * are part of the seam under test.
 */
export const spaceRepositoryContract = (
  name: string,
  createHarness: () => Promise<RepositoryHarness>,
): void => {
  const withHarness = async (body: (repository: SpaceRepository) => Promise<void>) => {
    const harness = await createHarness();
    try {
      await body(harness.repository);
    } finally {
      await harness.close();
    }
  };

  const seed = async (repository: SpaceRepository, ...spaces: readonly SpaceSnapshot[]) => {
    const result = await repository.importSpaces(spaces, 'insert');
    if (result.kind !== 'imported') throw new Error(`Seeding failed: ${result.message}`);
    return result.spaces;
  };

  it(`${name} imports a Space, then lists, loads and commits it`, async () => {
    await withHarness(async (repository) => {
      const first = space(SPACE_ID, 'One', [CARD_ID]);

      await expect(repository.importSpaces([first], 'insert')).resolves.toEqual({
        kind: 'imported',
        spaces: [stored(first, 0n, null)],
      });
      expect(new Set(await repository.listSpaces())).toEqual(
        new Set([{ id: SPACE_ID, title: 'One' }]),
      );
      await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual(stored(first, 0n, null));
      await expect(repository.loadSpace(MISSING_SPACE_ID)).resolves.toBeUndefined();

      const changed = retitled(first, 'Changed');
      await expect(repository.commitSpace(changed, 0n)).resolves.toEqual({
        kind: 'committed',
        revision: 1n,
      });
      await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual(stored(changed, 1n, null));
    });
  });

  it(`${name} answers a stale expected revision with the current aggregate`, async () => {
    await withHarness(async (repository) => {
      const first = space(SPACE_ID, 'One', [CARD_ID]);
      await seed(repository, first);
      const committed = retitled(first, 'Committed');
      await repository.commitSpace(committed, 0n);

      await expect(repository.commitSpace(retitled(first, 'Stale'), 0n)).resolves.toEqual({
        kind: 'conflict',
        current: stored(committed, 1n, null),
      });
      await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual(stored(committed, 1n, null));
    });
  });

  it(`${name} refuses a commit that fails domain intake and stores nothing`, async () => {
    await withHarness(async (repository) => {
      const first = space(SPACE_ID, 'One', [CARD_ID]);
      await seed(repository, first);
      const dangling: SpaceSnapshot = {
        ...first,
        document: {
          ...first.document,
          graphs: [
            { id: GRAPH_ID, title: 'Dangling', edges: [{ from: CARD_ID, to: MISSING_CARD_ID }] },
          ],
        },
      };

      await expect(repository.commitSpace(dangling, 0n)).resolves.toMatchObject({
        kind: 'rejected',
        code: 'invalid-snapshot',
      });
      await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual(stored(first, 0n, null));
    });
  });

  it(`${name} refuses a commit for a Space it does not store`, async () => {
    await withHarness(async (repository) => {
      const absent = space(MISSING_SPACE_ID, 'Absent', []);

      await expect(repository.commitSpace(absent, 0n)).resolves.toEqual({
        kind: 'rejected',
        code: 'not-found',
        message: `Space ${MISSING_SPACE_ID} does not exist`,
      });
      await expect(repository.loadSpace(MISSING_SPACE_ID)).resolves.toBeUndefined();
    });
  });

  it(`${name} refuses a commit claiming a Card another Space owns`, async () => {
    await withHarness(async (repository) => {
      const first = space(SPACE_ID, 'One', [CARD_ID]);
      const other = space(OTHER_SPACE_ID, 'Other', [OTHER_CARD_ID]);
      await seed(repository, first, other);
      const claiming: SpaceSnapshot = {
        ...retitled(other, 'Must roll back'),
        cards: [...other.cards, card(CARD_ID, 'Claimed')],
      };

      await expect(repository.commitSpace(claiming, 0n)).resolves.toMatchObject({
        kind: 'rejected',
        code: 'invalid-snapshot',
      });
      await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual(stored(first, 0n, null));
      await expect(repository.loadSpace(OTHER_SPACE_ID)).resolves.toEqual(stored(other, 0n, null));
    });
  });

  it(`${name} keeps the Cards a commit names and drops the ones it omits`, async () => {
    await withHarness(async (repository) => {
      const first = space(SPACE_ID, 'One', [CARD_ID, SECOND_CARD_ID]);
      await seed(repository, first);
      const narrowed: SpaceSnapshot = { ...first, cards: [card(CARD_ID, 'Kept')] };

      await expect(repository.commitSpace(narrowed, 0n)).resolves.toMatchObject({
        kind: 'committed',
      });
      await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual(stored(narrowed, 1n, null));
    });
  });

  /*
   * `loadSpaceAggregate` orders the PostgreSQL aggregate's cards by id, on the
   * read inside an import transaction and on the one outside it alike, so
   * ascending id order is what every read path answers with — and the
   * whole-snapshot `toEqual` comparisons throughout this suite are
   * order-sensitive on that array. Supplied here in descending order, because
   * every other case supplies them already sorted, where an unordered
   * implementation passes.
   */
  it(`${name} returns a Space's Cards in ascending id order however they were supplied`, async () => {
    await withHarness(async (repository) => {
      const descending = space(SPACE_ID, 'Unordered', [OTHER_CARD_ID, SECOND_CARD_ID, CARD_ID]);
      const ascending = space(SPACE_ID, 'Unordered', [CARD_ID, SECOND_CARD_ID, OTHER_CARD_ID]);

      await expect(repository.importSpaces([descending], 'insert')).resolves.toEqual({
        kind: 'imported',
        spaces: [stored(ascending, 0n, null)],
      });
      await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual(stored(ascending, 0n, null));

      await expect(repository.commitSpace(descending, 0n)).resolves.toMatchObject({
        kind: 'committed',
      });
      await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual(stored(ascending, 1n, null));
    });
  });

  it(`${name} records an exported revision and carries it across later commits`, async () => {
    await withHarness(async (repository) => {
      const first = space(SPACE_ID, 'One', [CARD_ID]);
      await seed(repository, first);

      await repository.markExported(SPACE_ID, 0n);
      const changed = retitled(first, 'Edited after export');
      await expect(repository.commitSpace(changed, 0n)).resolves.toMatchObject({
        kind: 'committed',
      });

      await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual(stored(changed, 1n, 0n));
    });
  });

  it(`${name} refuses to record an exported revision for a Space it does not store`, async () => {
    await withHarness(async (repository) => {
      await expect(repository.markExported(MISSING_SPACE_ID, 0n)).rejects.toThrow(
        `Space ${MISSING_SPACE_ID} does not exist`,
      );
    });
  });

  it(`${name} refuses a batch that repeats a Space identity, storing none of it`, async () => {
    await withHarness(async (repository) => {
      const batch = [
        space(SPACE_ID, 'First', [CARD_ID]),
        space(SPACE_ID, 'Repeat', [OTHER_CARD_ID]),
      ];

      await expect(repository.importSpaces(batch, 'insert')).resolves.toMatchObject({
        kind: 'rejected',
        code: 'duplicate-identity',
      });
      expect(await repository.listSpaces()).toEqual([]);
    });
  });

  /*
   * A Card repeated inside one batch is an identity collision; a Card already
   * owned by a stored Space is an ownership conflict. Two distinct codes for two
   * distinct facts, and the pair is the reason this suite exists — the memory
   * double folded them together twice before, which made it reject valid input
   * under a code the real backend never returns for it.
   */
  it(`${name} refuses a batch that repeats a Card identity, storing none of it`, async () => {
    await withHarness(async (repository) => {
      const batch = [
        space(SPACE_ID, 'First', [CARD_ID]),
        space(OTHER_SPACE_ID, 'Second', [CARD_ID]),
      ];

      await expect(repository.importSpaces(batch, 'insert')).resolves.toEqual({
        kind: 'rejected',
        code: 'duplicate-identity',
        message: `Duplicate card identity "${CARD_ID}"`,
      });
      expect(await repository.listSpaces()).toEqual([]);
    });
  });

  it(`${name} refuses a batch claiming a Card a stored Space owns`, async () => {
    await withHarness(async (repository) => {
      const first = space(SPACE_ID, 'One', [CARD_ID]);
      await seed(repository, first);

      await expect(
        repository.importSpaces([space(OTHER_SPACE_ID, 'Claimant', [CARD_ID])], 'insert'),
      ).resolves.toMatchObject({ kind: 'rejected', code: 'card-ownership' });
      await expect(repository.loadSpace(OTHER_SPACE_ID)).resolves.toBeUndefined();
      await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual(stored(first, 0n, null));
    });
  });

  it(`${name} refuses a Space identity it already stores, without touching it`, async () => {
    await withHarness(async (repository) => {
      const first = space(SPACE_ID, 'One', [CARD_ID]);
      await seed(repository, first);
      const later = [
        space(OTHER_SPACE_ID, 'Must roll back', [OTHER_CARD_ID]),
        retitled(first, 'Reimported'),
      ];

      await expect(repository.importSpaces(later, 'insert')).resolves.toEqual({
        kind: 'rejected',
        code: 'duplicate-identity',
        message: `Space ${SPACE_ID} already exists`,
      });
      await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual(stored(first, 0n, null));
      await expect(repository.loadSpace(OTHER_SPACE_ID)).resolves.toBeUndefined();
    });
  });

  it(`${name} refuses an import that fails domain intake, storing none of the batch`, async () => {
    await withHarness(async (repository) => {
      const valid = space(SPACE_ID, 'Must roll back', [CARD_ID]);
      const dangling: SpaceSnapshot = {
        ...space(OTHER_SPACE_ID, 'Dangling', [OTHER_CARD_ID]),
        document: {
          version: 2,
          title: 'Dangling',
          graphs: [
            {
              id: GRAPH_ID,
              title: 'Dangling',
              edges: [{ from: OTHER_CARD_ID, to: MISSING_CARD_ID }],
            },
          ],
        },
      };

      await expect(repository.importSpaces([valid, dangling], 'insert')).resolves.toMatchObject({
        kind: 'rejected',
        code: 'invalid-snapshot',
      });
      expect(await repository.listSpaces()).toEqual([]);
    });
  });

  /*
   * A batch can be both, and only one code comes back.
   * `PostgresSpaceRepository` settles that before its transaction opens: shape
   * and then batch identity run over the whole batch, while domain intake runs
   * per Space inside it. Identity therefore wins over intake whatever order the
   * batch is in, and the double has to lose the same way round — otherwise the
   * CLI names a different fault for the same directory depending on backend.
   */
  it(`${name} answers a batch that is both duplicated and domain-invalid with the duplicate`, async () => {
    await withHarness(async (repository) => {
      const dangling: SpaceSnapshot = {
        ...space(SPACE_ID, 'Dangling', [CARD_ID]),
        document: {
          version: 2,
          title: 'Dangling',
          graphs: [
            { id: GRAPH_ID, title: 'Dangling', edges: [{ from: CARD_ID, to: MISSING_CARD_ID }] },
          ],
        },
      };
      const repeated = space(SPACE_ID, 'Repeat', [OTHER_CARD_ID]);

      await expect(repository.importSpaces([dangling, repeated], 'insert')).resolves.toMatchObject({
        kind: 'rejected',
        code: 'duplicate-identity',
      });
      expect(await repository.listSpaces()).toEqual([]);
    });
  });

  /*
   * Truncation drops every stored Space, so a Card a doomed Space owns is free.
   * Ownership is judged against what survives the call, never against what the
   * same call is about to delete.
   */
  it(`${name} replaces everything stored in truncate mode, freeing the Card ids it clears`, async () => {
    await withHarness(async (repository) => {
      await seed(repository, space(SPACE_ID, 'Cleared', [CARD_ID]));
      const replacement = space(OTHER_SPACE_ID, 'Replacement', [CARD_ID]);

      await expect(repository.importSpaces([replacement], 'truncate')).resolves.toEqual({
        kind: 'imported',
        spaces: [stored(replacement, 0n, null)],
      });
      await expect(repository.loadSpace(SPACE_ID)).resolves.toBeUndefined();
      expect(new Set(await repository.listSpaces())).toEqual(
        new Set([{ id: OTHER_SPACE_ID, title: 'Replacement' }]),
      );
    });
  });

  it(`${name} mints every identity an import leaves out, keeping the explicit ones`, async () => {
    await withHarness(async (repository) => {
      const input: ImportSpace = {
        document: {
          version: 2,
          title: 'Partly identified',
          graphs: [{ title: 'Explicit cards', edges: [{ from: CARD_ID, to: SECOND_CARD_ID }] }],
          layouts: [
            {
              title: 'Minted layout',
              kind: 'positioned',
              positions: { [CARD_ID]: { x: 4, y: 8 } },
            },
          ],
        },
        cards: [
          card(CARD_ID, 'First'),
          card(SECOND_CARD_ID, 'Second'),
          { document: { title: 'Minted', kind: 'markdown', body: 'Minted' } },
        ],
      };

      const result = await repository.importSpaces([input], 'insert');
      expect(result.kind).toBe('imported');
      if (result.kind !== 'imported') throw new Error(result.message);
      const [only] = result.spaces;
      if (only === undefined) throw new Error('Import returned no Space');

      const minted = only.snapshot.cards.find(({ id }) => id !== CARD_ID && id !== SECOND_CARD_ID);
      const graph = only.snapshot.document.graphs[0];
      const layout = only.snapshot.document.layouts?.[0];
      if (minted === undefined) throw new Error('The id-less card kept no identity');
      if (graph === undefined || layout === undefined) throw new Error('Structure was not stored');

      const identities = [only.snapshot.id, minted.id, graph.id, layout.id];
      for (const id of identities) expect(uuidSchema.safeParse(id).success).toBe(true);
      expect(new Set(identities).size).toBe(identities.length);
      expect(graph.edges).toEqual([{ from: CARD_ID, to: SECOND_CARD_ID }]);
      expect(layout.positions).toEqual({ [CARD_ID]: { x: 4, y: 8 } });
      await expect(repository.loadSpace(only.snapshot.id)).resolves.toEqual(only);
    });
  });
};
