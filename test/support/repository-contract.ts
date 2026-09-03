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
/** The contract's Meta Space, and the first Space every case imports. */
const SPACE_ID = uuidSchema.parse('c0000000-0000-4000-8000-000000000001');
const OTHER_SPACE_ID = uuidSchema.parse('c0000000-0000-4000-8000-000000000002');
const MISSING_SPACE_ID = uuidSchema.parse('c0000000-0000-4000-8000-000000000003');
const CARD_ID = uuidSchema.parse('c0000000-0000-4000-8000-000000000010');
const SECOND_CARD_ID = uuidSchema.parse('c0000000-0000-4000-8000-000000000011');
const OTHER_CARD_ID = uuidSchema.parse('c0000000-0000-4000-8000-000000000012');
const LINK_CARD_ID = uuidSchema.parse('c0000000-0000-4000-8000-000000000013');
const MISSING_CARD_ID = uuidSchema.parse('c0000000-0000-4000-8000-000000000016');
const THIRD_SPACE_CARD_ID = uuidSchema.parse('c0000000-0000-4000-8000-000000000014');
const FOURTH_SPACE_CARD_ID = uuidSchema.parse('c0000000-0000-4000-8000-000000000015');
const GRAPH_ID = uuidSchema.parse('c0000000-0000-4000-8000-000000000020');
const LAYOUT_ID = uuidSchema.parse('c0000000-0000-4000-8000-000000000021');
const SECOND_GRAPH_ID = uuidSchema.parse('c0000000-0000-4000-8000-000000000022');
const SECOND_LAYOUT_ID = uuidSchema.parse('c0000000-0000-4000-8000-000000000023');

const card = (id: UUID, title: string) => ({
  id,
  document: { title, kind: 'markdown' as const, body: title },
});

const spaceCard = (
  id: UUID,
  target: UUID,
  selection: { readonly spaceView?: UUID; readonly graph?: UUID } = {},
) => ({
  id,
  document: { title: `Open ${target}`, kind: 'space' as const, spaceId: target, ...selection },
});

/**
 * A Space with cards and no structure — no layouts, and so no graphs, which is
 * one statement under version 1 (ADR 0040). Most of this suite is about
 * identity, rollback and revisions rather than about structure, so the cases
 * that need a graph build a layout to own it rather than every case carrying an
 * empty collection.
 */
const space = (id: UUID, title: string, cardIds: readonly UUID[]): SpaceSnapshot => ({
  id,
  document: { version: 1, title },
  cards: cardIds.map((cardId) => card(cardId, `${title} card`)),
});

/**
 * A Space whose one layout owns one graph with one edge out of the layout.
 *
 * Under version 1 an edge endpoint must name a card of the layout that owns the
 * graph, so "dangling" is now a membership failure rather than a space-wide
 * lookup miss — and a graph can only reach domain intake through a layout, so
 * the failure cannot be built without one.
 */
const spaceWithDanglingEdge = (id: UUID, title: string, memberId: UUID): SpaceSnapshot => ({
  ...space(id, title, [memberId]),
  document: {
    version: 1,
    title,
    layouts: [
      {
        id: LAYOUT_ID,
        title: 'Dangling',
        kind: 'positioned',
        positions: { [memberId]: { x: 0, y: 0, open: false } },
        graphs: [
          { id: GRAPH_ID, title: 'Dangling', edges: [{ from: memberId, to: MISSING_CARD_ID }] },
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

export interface RepositoryHarness {
  repository: SpaceRepository;
  close(): Promise<void>;
}

const commitUpdate = (repository: SpaceRepository, snapshot: SpaceSnapshot, revision: bigint) =>
  repository.commit({
    changes: [
      {
        kind: 'update',
        spaceId: snapshot.id,
        snapshot,
        expectedRevision: revision,
      },
    ],
  });

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

  it(`${name} initializes and replaces only through explicit Meta-rooted aggregates`, async () => {
    await withHarness(async (repository) => {
      const first = space(SPACE_ID, 'One', [CARD_ID]);
      await expect(repository.loadAggregate()).resolves.toEqual({ kind: 'uninitialized' });
      await expect(
        repository.initializeAggregate({ metaSpaceId: SPACE_ID, spaces: [first] }),
      ).resolves.toEqual({
        kind: 'initialized',
        aggregate: { metaSpaceId: SPACE_ID, spaces: [stored(first, 0n, null)] },
      });
      await expect(
        repository.initializeAggregate({ metaSpaceId: SPACE_ID, spaces: [structuredClone(first)] }),
      ).resolves.toMatchObject({ kind: 'existing' });

      const replacement = retitled(first, 'Replacement');
      await expect(
        repository.replaceAggregate(
          { metaSpaceId: SPACE_ID, spaces: [replacement] },
          OTHER_SPACE_ID,
        ),
      ).resolves.toEqual({ kind: 'conflict', currentMetaSpaceId: SPACE_ID });
      await expect(
        repository.replaceAggregate({ metaSpaceId: SPACE_ID, spaces: [replacement] }, SPACE_ID),
      ).resolves.toEqual({
        kind: 'replaced',
        aggregate: { metaSpaceId: SPACE_ID, spaces: [stored(replacement, 0n, null)] },
      });
    });
  });

  it(`${name} classifies canonical initialization and invalid lifecycle proposals`, async () => {
    await withHarness(async (repository) => {
      const child = space(OTHER_SPACE_ID, 'Child', [OTHER_CARD_ID]);
      const meta = {
        ...space(SPACE_ID, 'Meta', [CARD_ID]),
        cards: [card(CARD_ID, 'Meta card'), spaceCard(LINK_CARD_ID, OTHER_SPACE_ID)],
      };
      const input = { metaSpaceId: SPACE_ID, spaces: [meta, child] };
      const [first, second] = await Promise.all([
        repository.initializeAggregate(input),
        repository.initializeAggregate({ metaSpaceId: SPACE_ID, spaces: [child, meta] }),
      ]);
      expect(new Set([first.kind, second.kind])).toEqual(new Set(['initialized', 'existing']));

      await expect(
        repository.initializeAggregate({
          metaSpaceId: SPACE_ID,
          spaces: [retitled(meta, 'Different'), child],
        }),
      ).resolves.toMatchObject({ kind: 'already-initialized' });
      await expect(
        repository.replaceAggregate(
          { metaSpaceId: MISSING_SPACE_ID, spaces: [meta, child] },
          SPACE_ID,
        ),
      ).resolves.toMatchObject({ kind: 'aggregate-refused' });
    });
  });

  it(`${name} ignores object-key insertion order when classifying initialization`, async () => {
    await withHarness(async (repository) => {
      const first: SpaceSnapshot = {
        id: SPACE_ID,
        document: { version: 1, title: 'Meta' },
        cards: [
          {
            id: CARD_ID,
            document: { title: 'Card', kind: 'markdown', body: 'Body' },
          },
        ],
      };
      const reordered: SpaceSnapshot = {
        id: SPACE_ID,
        document: { title: 'Meta', version: 1 },
        cards: [
          {
            id: CARD_ID,
            document: { body: 'Body', kind: 'markdown', title: 'Card' },
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
  });

  it(`${name} lets only one different concurrent initialization establish state`, async () => {
    await withHarness(async (repository) => {
      const first = space(SPACE_ID, 'First', [CARD_ID]);
      const second = space(OTHER_SPACE_ID, 'Second', [OTHER_CARD_ID]);
      const results = await Promise.all([
        repository.initializeAggregate({ metaSpaceId: SPACE_ID, spaces: [first] }),
        repository.initializeAggregate({ metaSpaceId: OTHER_SPACE_ID, spaces: [second] }),
      ]);
      expect(new Set(results.map(({ kind }) => kind))).toEqual(
        new Set(['initialized', 'already-initialized']),
      );
      const loaded = await repository.loadAggregate();
      expect(loaded.kind).toBe('loaded');
    });
  });

  it(`${name} rolls back a refused replacement`, async () => {
    await withHarness(async (repository) => {
      const initial = space(SPACE_ID, 'Initial', [CARD_ID]);
      await repository.initializeAggregate({ metaSpaceId: SPACE_ID, spaces: [initial] });
      await expect(
        repository.replaceAggregate(
          { metaSpaceId: MISSING_SPACE_ID, spaces: [retitled(initial, 'Invalid')] },
          SPACE_ID,
        ),
      ).resolves.toMatchObject({ kind: 'aggregate-refused' });
      await expect(repository.loadAggregate()).resolves.toEqual({
        kind: 'loaded',
        aggregate: { metaSpaceId: SPACE_ID, spaces: [stored(initial, 0n, null)] },
      });
    });
  });

  it(`${name} refuses replacement before initialization`, async () => {
    await withHarness(async (repository) => {
      const meta = space(SPACE_ID, 'Meta', [CARD_ID]);
      await expect(
        repository.replaceAggregate({ metaSpaceId: SPACE_ID, spaces: [meta] }, SPACE_ID),
      ).resolves.toEqual({ kind: 'uninitialized' });
      await expect(repository.loadAggregate()).resolves.toEqual({ kind: 'uninitialized' });
    });
  });

  it(`${name} refuses a replacement authorized against a superseded Meta identity`, async () => {
    await withHarness(async (repository) => {
      const initial = space(SPACE_ID, 'Initial', [CARD_ID]);
      const first = space(OTHER_SPACE_ID, 'First replacement', [OTHER_CARD_ID]);
      const second = space(MISSING_SPACE_ID, 'Second replacement', [MISSING_CARD_ID]);
      await repository.initializeAggregate({ metaSpaceId: SPACE_ID, spaces: [initial] });

      await expect(
        repository.replaceAggregate({ metaSpaceId: OTHER_SPACE_ID, spaces: [first] }, SPACE_ID),
      ).resolves.toMatchObject({ kind: 'replaced' });
      /*
       * A replacement names the Meta identity it read, and the first one
       * retired SPACE_ID. So the second is authorized against an aggregate that
       * no longer exists and is refused, whatever it proposes.
       *
       * Deliberately sequential. What two *overlapping* replacements do is
       * PostgreSQL's Meta row lock deciding which is granted it last, which is
       * transactional isolation a `Map` cannot have -- it is forced with a
       * barrier and asserted in the integration suite, and stating it here made
       * the contract read as though call order settled the winner.
       */
      await expect(
        repository.replaceAggregate({ metaSpaceId: MISSING_SPACE_ID, spaces: [second] }, SPACE_ID),
      ).resolves.toEqual({ kind: 'conflict', currentMetaSpaceId: OTHER_SPACE_ID });
      await expect(repository.loadAggregate()).resolves.toEqual({
        kind: 'loaded',
        aggregate: { metaSpaceId: OTHER_SPACE_ID, spaces: [stored(first, 0n, null)] },
      });
    });
  });

  /*
   * The migration that adds the singleton Meta row deliberately leaves it empty
   * — a migration has no Space to name — so whatever first puts a Space in the
   * repository has to establish it. Without that, `loadAggregate` and every
   * `commit` fail on a repository that has only ever been migrated.
   */
  it(`${name} becomes committable from an empty store`, async () => {
    await withHarness(async (repository) => {
      const first = space(SPACE_ID, 'One', [CARD_ID]);
      await seed(repository, first);

      await expect(repository.loadAggregate()).resolves.toEqual({
        kind: 'loaded',
        aggregate: { metaSpaceId: SPACE_ID, spaces: [stored(first, 0n, null)] },
      });
      await expect(commitUpdate(repository, retitled(first, 'Changed'), 0n)).resolves.toEqual({
        kind: 'committed',
        revisions: [{ spaceId: SPACE_ID, revision: 1n }],
        deletedSpaceIds: [],
      });
    });
  });

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
      await expect(commitUpdate(repository, changed, 0n)).resolves.toEqual({
        kind: 'committed',
        revisions: [{ spaceId: SPACE_ID, revision: 1n }],
        deletedSpaceIds: [],
      });
      await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual(stored(changed, 1n, null));
    });
  });

  it(`${name} refuses to create a new unreachable Space by removing its last reference alone`, async () => {
    await withHarness(async (repository) => {
      const target = space(OTHER_SPACE_ID, 'Target', [OTHER_CARD_ID]);
      const linkedMeta: SpaceSnapshot = {
        ...space(SPACE_ID, 'Meta', [CARD_ID]),
        cards: [card(CARD_ID, 'Meta card'), spaceCard(SECOND_CARD_ID, OTHER_SPACE_ID)],
      };
      await seed(repository, linkedMeta, target);

      const unlinked = { ...linkedMeta, cards: [card(CARD_ID, 'Meta card')] };
      await expect(commitUpdate(repository, unlinked, 0n)).resolves.toEqual({
        kind: 'aggregate-refused',
        errors: [{ kind: 'ordinary-space-unreferenced', spaceId: OTHER_SPACE_ID }],
      });
      await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual(stored(linkedMeta, 0n, null));
      await expect(repository.loadSpace(OTHER_SPACE_ID)).resolves.toEqual(stored(target, 0n, null));
    });
  });

  it(`${name} atomically creates, links, reads, converges on, and deletes a Space`, async () => {
    await withHarness(async (repository) => {
      const meta = space(SPACE_ID, 'Meta', [CARD_ID]);
      await seed(repository, meta);
      const child = space(OTHER_SPACE_ID, 'Child', [OTHER_CARD_ID]);
      const linked = {
        ...meta,
        cards: [
          ...meta.cards,
          spaceCard(SECOND_CARD_ID, OTHER_SPACE_ID),
          spaceCard(LINK_CARD_ID, OTHER_SPACE_ID),
        ],
      };

      await expect(
        repository.commit({
          changes: [
            {
              kind: 'update',
              spaceId: SPACE_ID,
              snapshot: linked,
              expectedRevision: 0n,
            },
            { kind: 'create', spaceId: OTHER_SPACE_ID, snapshot: child },
          ],
        }),
      ).resolves.toEqual({
        kind: 'committed',
        revisions: [
          { spaceId: SPACE_ID, revision: 1n },
          { spaceId: OTHER_SPACE_ID, revision: 0n },
        ],
        deletedSpaceIds: [],
      });
      await expect(repository.loadAggregate()).resolves.toEqual({
        kind: 'loaded',
        aggregate: {
          metaSpaceId: SPACE_ID,
          spaces: [stored(linked, 1n, null), stored(child, 0n, null)],
        },
      });

      await expect(
        repository.commit({
          changes: [{ kind: 'delete', spaceId: OTHER_SPACE_ID, expectedRevision: 0n }],
        }),
      ).resolves.toEqual({
        kind: 'conflict',
        conflicts: [{ spaceId: OTHER_SPACE_ID, current: stored(child, 0n, null) }],
      });

      /*
       * A reference the caller is itself submitting is not authoritative state,
       * so an incomplete deletion it can see in its own change set is a refusal
       * rather than a conflict. Answering `conflict` here would be unbreakable:
       * reloading returns the target at the same revision it already holds, and
       * the identical change set conflicts again.
       */
      const halfUnlinked = {
        ...meta,
        cards: [...meta.cards, spaceCard(LINK_CARD_ID, OTHER_SPACE_ID)],
      };
      await expect(
        repository.commit({
          changes: [
            {
              kind: 'update',
              spaceId: SPACE_ID,
              snapshot: halfUnlinked,
              expectedRevision: 1n,
            },
            { kind: 'delete', spaceId: OTHER_SPACE_ID, expectedRevision: 0n },
          ],
        }),
      ).resolves.toMatchObject({ kind: 'aggregate-refused' });
      await expect(repository.loadSpace(OTHER_SPACE_ID)).resolves.toEqual(stored(child, 0n, null));

      await expect(
        repository.commit({
          changes: [
            {
              kind: 'update',
              spaceId: SPACE_ID,
              snapshot: meta,
              expectedRevision: 1n,
            },
            { kind: 'delete', spaceId: OTHER_SPACE_ID, expectedRevision: 0n },
          ],
        }),
      ).resolves.toEqual({
        kind: 'committed',
        revisions: [{ spaceId: SPACE_ID, revision: 2n }],
        deletedSpaceIds: [OTHER_SPACE_ID],
      });
      await expect(repository.loadSpace(OTHER_SPACE_ID)).resolves.toBeUndefined();
    });
  });

  it(`${name} round trips every optional Space Card selection combination across a later default change`, async () => {
    await withHarness(async (repository) => {
      const meta = space(SPACE_ID, 'Meta', [CARD_ID]);
      await seed(repository, meta);
      const target: SpaceSnapshot = {
        ...space(OTHER_SPACE_ID, 'Target', [OTHER_CARD_ID]),
        document: {
          version: 1,
          title: 'Target',
          defaultRenderer: LAYOUT_ID,
          layouts: [
            {
              id: LAYOUT_ID,
              title: 'First view',
              kind: 'positioned',
              positions: { [OTHER_CARD_ID]: { x: 0, y: 0, open: false } },
              graphs: [{ id: GRAPH_ID, title: 'First graph', edges: [] }],
            },
            {
              id: SECOND_LAYOUT_ID,
              title: 'Second view',
              kind: 'positioned',
              positions: { [OTHER_CARD_ID]: { x: 100, y: 100, open: false } },
              graphs: [{ id: SECOND_GRAPH_ID, title: 'Second graph', edges: [] }],
            },
          ],
        },
      };
      const unselected = spaceCard(SECOND_CARD_ID, OTHER_SPACE_ID);
      const selectedView = spaceCard(LINK_CARD_ID, OTHER_SPACE_ID, {
        spaceView: SECOND_LAYOUT_ID,
      });
      const selectedGraphWithDefaultView = spaceCard(THIRD_SPACE_CARD_ID, OTHER_SPACE_ID, {
        graph: GRAPH_ID,
      });
      const selectedViewAndGraph = spaceCard(FOURTH_SPACE_CARD_ID, OTHER_SPACE_ID, {
        spaceView: SECOND_LAYOUT_ID,
        graph: SECOND_GRAPH_ID,
      });
      const linked = {
        ...meta,
        cards: [
          ...meta.cards,
          unselected,
          selectedView,
          selectedGraphWithDefaultView,
          selectedViewAndGraph,
        ],
      };

      await expect(
        repository.commit({
          changes: [
            { kind: 'update', spaceId: SPACE_ID, snapshot: linked, expectedRevision: 0n },
            { kind: 'create', spaceId: OTHER_SPACE_ID, snapshot: target },
          ],
        }),
      ).resolves.toMatchObject({ kind: 'committed' });

      const retargetedDefault: SpaceSnapshot = {
        ...target,
        document: { ...target.document, defaultRenderer: SECOND_LAYOUT_ID },
      };
      await expect(commitUpdate(repository, retargetedDefault, 0n)).resolves.toMatchObject({
        kind: 'aggregate-refused',
      });
      await expect(repository.loadSpace(OTHER_SPACE_ID)).resolves.toEqual(stored(target, 0n, null));

      const linkedToLaterDefault: SpaceSnapshot = {
        ...linked,
        cards: [
          ...meta.cards,
          unselected,
          selectedView,
          spaceCard(THIRD_SPACE_CARD_ID, OTHER_SPACE_ID, { graph: SECOND_GRAPH_ID }),
          selectedViewAndGraph,
        ],
      };
      await expect(
        repository.commit({
          changes: [
            {
              kind: 'update',
              spaceId: SPACE_ID,
              snapshot: linkedToLaterDefault,
              expectedRevision: 1n,
            },
            {
              kind: 'update',
              spaceId: OTHER_SPACE_ID,
              snapshot: retargetedDefault,
              expectedRevision: 0n,
            },
          ],
        }),
      ).resolves.toEqual({
        kind: 'committed',
        revisions: [
          { spaceId: SPACE_ID, revision: 2n },
          { spaceId: OTHER_SPACE_ID, revision: 1n },
        ],
        deletedSpaceIds: [],
      });
      const result = await repository.loadAggregate();
      if (result.kind === 'uninitialized') throw new Error('Seeded repository is uninitialized');
      const aggregate = result.aggregate;
      expect(aggregate).toEqual({
        metaSpaceId: SPACE_ID,
        spaces: [stored(linkedToLaterDefault, 2n, null), stored(retargetedDefault, 1n, null)],
      });
      const storedSpaceCard = aggregate.spaces[0]?.snapshot.cards.find(
        ({ id }) => id === SECOND_CARD_ID,
      );
      expect(storedSpaceCard?.document).toStrictEqual({
        title: `Open ${OTHER_SPACE_ID}`,
        kind: 'space',
        spaceId: OTHER_SPACE_ID,
      });
    });
  });

  it(`${name} reports every conflict and rolls back every refused aggregate`, async () => {
    await withHarness(async (repository) => {
      const meta = space(SPACE_ID, 'Meta', [CARD_ID]);
      await seed(repository, meta);
      const orphan = space(OTHER_SPACE_ID, 'Orphan', [OTHER_CARD_ID]);

      await expect(
        repository.commit({
          changes: [{ kind: 'create', spaceId: OTHER_SPACE_ID, snapshot: orphan }],
        }),
      ).resolves.toMatchObject({ kind: 'aggregate-refused' });
      await expect(repository.loadSpace(OTHER_SPACE_ID)).resolves.toBeUndefined();

      await expect(
        repository.commit({
          changes: [
            { kind: 'create', spaceId: SPACE_ID, snapshot: meta },
            {
              kind: 'update',
              spaceId: MISSING_SPACE_ID,
              snapshot: space(MISSING_SPACE_ID, 'Missing', []),
              expectedRevision: 0n,
            },
          ],
        }),
      ).resolves.toEqual({
        kind: 'conflict',
        conflicts: [
          { spaceId: SPACE_ID, current: stored(meta, 0n, null) },
          { spaceId: MISSING_SPACE_ID, current: undefined },
        ],
      });
      await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual(stored(meta, 0n, null));
    });
  });

  it(`${name} answers a stale expected revision with the current aggregate`, async () => {
    await withHarness(async (repository) => {
      const first = space(SPACE_ID, 'One', [CARD_ID]);
      await seed(repository, first);
      const committed = retitled(first, 'Committed');
      await commitUpdate(repository, committed, 0n);

      await expect(commitUpdate(repository, retitled(first, 'Stale'), 0n)).resolves.toEqual({
        kind: 'conflict',
        conflicts: [{ spaceId: SPACE_ID, current: stored(committed, 1n, null) }],
      });
      await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual(stored(committed, 1n, null));
    });
  });

  it(`${name} refuses a commit that fails domain intake and stores nothing`, async () => {
    await withHarness(async (repository) => {
      const first = space(SPACE_ID, 'One', [CARD_ID]);
      await seed(repository, first);
      const dangling = spaceWithDanglingEdge(SPACE_ID, 'One', CARD_ID);

      await expect(commitUpdate(repository, dangling, 0n)).resolves.toMatchObject({
        kind: 'aggregate-refused',
      });
      await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual(stored(first, 0n, null));
    });
  });

  it(`${name} refuses a commit for a Space it does not store`, async () => {
    await withHarness(async (repository) => {
      const absent = space(MISSING_SPACE_ID, 'Absent', []);

      await expect(commitUpdate(repository, absent, 0n)).resolves.toEqual({
        kind: 'conflict',
        conflicts: [{ spaceId: MISSING_SPACE_ID, current: undefined }],
      });
      await expect(repository.loadSpace(MISSING_SPACE_ID)).resolves.toBeUndefined();
    });
  });

  it(`${name} refuses a commit whose Space id differs from its snapshot id`, async () => {
    await withHarness(async (repository) => {
      const first = space(SPACE_ID, 'One', [CARD_ID]);
      await seed(repository, first);

      await expect(
        repository.commit({
          changes: [
            {
              kind: 'update',
              spaceId: OTHER_SPACE_ID,
              snapshot: first,
              expectedRevision: 0n,
            },
          ],
        }),
      ).resolves.toMatchObject({ kind: 'rejected', code: 'invalid-commit' });
      await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual(stored(first, 0n, null));
    });
  });

  it(`${name} refuses a commit that names one Space more than once`, async () => {
    await withHarness(async (repository) => {
      const first = space(SPACE_ID, 'One', [CARD_ID]);
      await seed(repository, first);

      await expect(
        repository.commit({
          changes: [
            {
              kind: 'update',
              spaceId: SPACE_ID,
              snapshot: retitled(first, 'First update'),
              expectedRevision: 0n,
            },
            {
              kind: 'update',
              spaceId: SPACE_ID,
              snapshot: retitled(first, 'Second update'),
              expectedRevision: 0n,
            },
          ],
        }),
      ).resolves.toMatchObject({ kind: 'rejected', code: 'invalid-commit' });
      await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual(stored(first, 0n, null));
    });
  });

  it(`${name} refuses a commit claiming a Card another Space owns`, async () => {
    await withHarness(async (repository) => {
      const first = space(SPACE_ID, 'One', [CARD_ID]);
      const other = space(OTHER_SPACE_ID, 'Other', [OTHER_CARD_ID]);
      const linked = {
        ...first,
        cards: [...first.cards, spaceCard(LINK_CARD_ID, OTHER_SPACE_ID)],
      };
      await seed(repository, linked, other);
      const claiming: SpaceSnapshot = {
        ...retitled(other, 'Must roll back'),
        cards: [...other.cards, card(CARD_ID, 'Claimed')],
      };

      await expect(commitUpdate(repository, claiming, 0n)).resolves.toMatchObject({
        kind: 'aggregate-refused',
      });
      await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual(stored(linked, 0n, null));
      await expect(repository.loadSpace(OTHER_SPACE_ID)).resolves.toEqual(stored(other, 0n, null));
    });
  });

  it(`${name} keeps the Cards a commit names and drops the ones it omits`, async () => {
    await withHarness(async (repository) => {
      const first = space(SPACE_ID, 'One', [CARD_ID, SECOND_CARD_ID]);
      await seed(repository, first);
      const narrowed: SpaceSnapshot = { ...first, cards: [card(CARD_ID, 'Kept')] };

      await expect(commitUpdate(repository, narrowed, 0n)).resolves.toMatchObject({
        kind: 'committed',
      });
      await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual(stored(narrowed, 1n, null));
    });
  });

  it(`${name} drops every Card when a commit omits them all`, async () => {
    await withHarness(async (repository) => {
      const first = space(SPACE_ID, 'One', [CARD_ID, SECOND_CARD_ID]);
      await seed(repository, first);
      const empty: SpaceSnapshot = { ...first, cards: [] };

      await expect(commitUpdate(repository, empty, 0n)).resolves.toMatchObject({
        kind: 'committed',
      });
      await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual(stored(empty, 1n, null));
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

      await expect(commitUpdate(repository, descending, 0n)).resolves.toMatchObject({
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
      await expect(commitUpdate(repository, changed, 0n)).resolves.toMatchObject({
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
      const dangling = spaceWithDanglingEdge(OTHER_SPACE_ID, 'Dangling', OTHER_CARD_ID);

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
      const dangling = spaceWithDanglingEdge(SPACE_ID, 'Dangling', CARD_ID);
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

  /*
   * A graph id is minted where the graph now lives — under the layout that owns
   * it — and in the same pass as that layout's own id, before the snapshot faces
   * domain intake and before the first card is written. Two id-less layouts,
   * because minting under one owner reads the same whether the pass walks
   * layouts or flattens them, and only a second owner tells those apart.
   */
  it(`${name} mints every identity an import leaves out, keeping the explicit ones`, async () => {
    await withHarness(async (repository) => {
      const input: ImportSpace = {
        document: {
          version: 1,
          title: 'Partly identified',
          layouts: [
            {
              title: 'Minted layout',
              kind: 'positioned',
              positions: {
                [CARD_ID]: { x: 4, y: 8, open: false },
                [SECOND_CARD_ID]: { x: 12, y: 16, open: false },
              },
              graphs: [{ title: 'Explicit cards', edges: [{ from: CARD_ID, to: SECOND_CARD_ID }] }],
            },
            {
              title: 'Second minted layout',
              kind: 'positioned',
              positions: { [CARD_ID]: { x: 0, y: 0, open: false } },
              graphs: [
                { id: GRAPH_ID, title: 'Explicit graph', edges: [{ from: CARD_ID, to: CARD_ID }] },
              ],
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
      const [layout, second] = only.snapshot.document.layouts ?? [];
      if (minted === undefined) throw new Error('The id-less card kept no identity');
      if (layout === undefined || second === undefined) throw new Error('Structure was not stored');
      const graph = layout.graphs[0];
      if (graph === undefined) throw new Error('The layout owns no graph');

      const identities = [only.snapshot.id, minted.id, graph.id, layout.id, second.id];
      for (const id of identities) expect(uuidSchema.safeParse(id).success).toBe(true);
      expect(new Set(identities).size).toBe(identities.length);
      expect(graph.edges).toEqual([{ from: CARD_ID, to: SECOND_CARD_ID }]);
      expect(layout.positions).toEqual({
        [CARD_ID]: { x: 4, y: 8, open: false },
        [SECOND_CARD_ID]: { x: 12, y: 16, open: false },
      });
      // The explicit graph id is kept, and kept under its own owner rather than
      // pooled with the minted one.
      expect(second.graphs.map(({ id }) => id)).toEqual([GRAPH_ID]);
      await expect(repository.loadSpace(only.snapshot.id)).resolves.toEqual(only);
    });
  });
};
