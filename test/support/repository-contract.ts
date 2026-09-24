import { uuidSchema, type GraphEdge, type SpaceSnapshot, type UUID } from '@project/core';
import { loadSpaceAggregate } from '@project/graph';
import {
  AggregateInvariantError,
  createWorkingSpaceLoader,
  REVISION_CEILING,
} from '@project/persistence';
import { expect, it } from 'vitest';
import type { SpaceRepository } from '../../src/persistence/space-repository';

/**
 * The behaviour every `SpaceRepository` owes its callers, run against each
 * implementation rather than restated per adapter.
 *
 * Every implementation judges a commit through `decideCommit` in
 * `@project/persistence` (ADR 0095), so what this suite catches is where they
 * differ around it — what they read, in what order, what they write and what
 * they classify from their own storage. Whatever they disagree about, they
 * disagree in front of the same assertions.
 *
 * It sits here rather than behind `@project/persistence/test-support`, where the
 * `SpaceBackend` contract lives, because `SpaceRepository` is declared in `src/`
 * — the two aggregate lifecycle doors and `markExported` are CLI capability and
 * stay out of the browser-safe package. `packages/persistence` may not import `src/` (its
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
 *    contract compares catalogs as sets. The Resources *inside* a Space are a
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
const RESOURCE_ID = uuidSchema.parse('c0000000-0000-4000-8000-000000000010');
const SECOND_RESOURCE_ID = uuidSchema.parse('c0000000-0000-4000-8000-000000000011');
const OTHER_RESOURCE_ID = uuidSchema.parse('c0000000-0000-4000-8000-000000000012');
const LINK_RESOURCE_ID = uuidSchema.parse('c0000000-0000-4000-8000-000000000013');
const MISSING_RESOURCE_ID = uuidSchema.parse('c0000000-0000-4000-8000-000000000016');
const THIRD_SPACE_RESOURCE_ID = uuidSchema.parse('c0000000-0000-4000-8000-000000000014');
const FOURTH_SPACE_RESOURCE_ID = uuidSchema.parse('c0000000-0000-4000-8000-000000000015');
const GRAPH_ID = uuidSchema.parse('c0000000-0000-4000-8000-000000000020');
const MAP_ID = uuidSchema.parse('c0000000-0000-4000-8000-000000000021');
const SECOND_GRAPH_ID = uuidSchema.parse('c0000000-0000-4000-8000-000000000022');
const SECOND_MAP_ID = uuidSchema.parse('c0000000-0000-4000-8000-000000000023');
const THIRD_GRAPH_ID = uuidSchema.parse('c0000000-0000-4000-8000-000000000024');
const FOURTH_GRAPH_ID = uuidSchema.parse('c0000000-0000-4000-8000-000000000025');

const resource = (id: UUID, title: string) => ({
  id,
  document: { title, kind: 'markdown' as const, body: title },
});

/**
 * A Space Resource and the selection it carries.
 *
 * The selection is a parameter rather than a default because a Space Resource names
 * a Map of its target and a Graph that Map owns from the moment it
 * exists (ADR 0079). Every case below therefore says which Map of which
 * target it is pointing at, and a target built without one cannot be linked to
 * at all — which is what `targetSpace` is for.
 */
const spaceResource = (
  id: UUID,
  target: UUID,
  selection: { readonly map: UUID; readonly graph: UUID },
) => ({
  id,
  document: { title: `Open ${target}`, kind: 'space' as const, spaceId: target, ...selection },
});

/**
 * A Space with resources and no structure — no maps, and so no graphs, which is
 * one statement under version 1 (ADR 0040). Most of this suite is about
 * identity, rollback and revisions rather than about structure, so the cases
 * that need a graph build a map to own it rather than every case carrying an
 * empty collection.
 */
const space = (id: UUID, title: string, resourceIds: readonly UUID[]): SpaceSnapshot => ({
  id,
  document: { version: 1, title },
  resources: resourceIds.map((resourceId) => resource(resourceId, `${title} resource`)),
});

/**
 * A Space complete enough to be pointed at: one positioned Map owning one
 * Graph, which is the least a Space Resource's selection can resolve against.
 *
 * `space` above deliberately has no structure, and under ADR 0079 that makes it
 * a Space no valid Space Resource can name. The cases that link build their target
 * through this instead, and select `MAP_ID` and `GRAPH_ID` when they do. The
 * Map positions nothing: what a Space Resource resolves is the Map and the
 * Graph, and which Resources that Map places is a separate matter this suite
 * never reads.
 */
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

const graphedSpace = (
  id: UUID,
  title: string,
  resourceIds: readonly [UUID, UUID],
  input: { readonly mapId?: UUID; readonly graphId?: UUID; readonly graphTitle?: string } = {},
): SpaceSnapshot => {
  const [from, to] = resourceIds;
  const mapId = input.mapId ?? MAP_ID;
  const graphId = input.graphId ?? GRAPH_ID;
  return {
    id,
    document: {
      version: 1,
      title,
      defaultMap: mapId,
      maps: [
        {
          id: mapId,
          title: 'Owner',
          kind: 'positioned',
          positions: {
            [from]: { x: 0, y: 0, open: false },
            [to]: { x: 300, y: 0, open: false },
          },
          graphs: [{ id: graphId, title: input.graphTitle ?? 'Graph', edges: [{ from, to }] }],
          activeGraph: graphId,
        },
      ],
    },
    resources: [resource(from, 'From'), resource(to, 'To')],
  };
};

/**
 * A Space whose one map owns one graph with one edge out of the map.
 *
 * Under version 1 an edge endpoint must name a resource of the map that owns the
 * graph, so "dangling" is now a membership failure rather than a space-wide
 * lookup miss — and a graph can only reach domain intake through a map, so
 * the failure cannot be built without one.
 */
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

/**
 * The one member the helpers below that skip an inapplicable harness need
 * from vitest's own per-test context (`it`'s callback parameter,
 * `ExtendedContext<Test>` in `@vitest/runner`), named locally rather than
 * importing that generic type for one method.
 */
type SkippableTestContext = { skip: () => void };

export interface RepositoryHarness {
  repository: SpaceRepository;
  close(): Promise<void>;
  /** Close and reopen the durable target, returning a fresh repository host. */
  reopenRepository?: () => Promise<SpaceRepository>;
  /** Store a SQL state that valid repository writes cannot produce. */
  arrangeBrokenState?: (
    kind: 'invalid-space-document' | 'invalid-aggregate',
    ids: { readonly spaceId: UUID; readonly otherSpaceId: UUID },
  ) => Promise<{ readonly expectedMetaSpaceId: UUID }>;
  /**
   * Remove the stored Meta identity while leaving Space rows in place. SQL
   * harnesses use this to model an interrupted destructive replacement; the
   * memory repository cannot represent that broken stored state.
   */
  removeMetaIdentity?: () => Promise<void>;
  /**
   * Write a stored Space's `revision` (and optionally `exportedRevision`)
   * column text verbatim, bypassing the repository's own write path and the
   * shared codec's format/ceiling check (ADR 0095). It is how the cases below
   * construct stored state no adapter's own `commit`/`initializeAggregate`
   * can produce — a non-canonical revision, or one already at the 2^63−1
   * ceiling — and it is `undefined` on a harness with no raw column to write
   * (the memory double, which mints every revision in-process and so can
   * never hold one that fails the codec).
   */
  writeRawRevision?: (input: {
    readonly spaceId: UUID;
    readonly revision: string;
    readonly exportedRevision?: string | null;
  }) => Promise<void>;
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
 * Seeding runs through `initializeAggregate` rather than through a constructor
 * argument, unlike the `SpaceBackend` contract. That is the door (ADR 0078):
 * rows reach a PostgreSQL-backed repository only through the two lifecycle
 * operations or a commit, all of which are part of the seam under test, and a
 * test helper seeds through the same ones the product uses.
 *
 * The first Space named is the Meta identity, stated rather than inferred —
 * every case below passes its whole aggregate in one call, so there is no batch
 * position for Meta to be read off.
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

  /**
   * `withHarness`, plus the raw revision-column write the ceiling and
   * canonical-decimal cases need. A harness with no `writeRawRevision` (the
   * memory double) has nothing for these to prove — a stored revision it
   * cannot represent in the first place — so the case is marked skipped
   * through vitest's own `context.skip()` rather than returning with no
   * assertion, which a runner reports as passed and a reader cannot tell
   * apart from a case that actually ran.
   */
  const withRawRevisionHarness = async (
    context: SkippableTestContext,
    body: (
      repository: SpaceRepository,
      writeRawRevision: NonNullable<RepositoryHarness['writeRawRevision']>,
    ) => Promise<void>,
  ) => {
    const harness = await createHarness();
    try {
      if (harness.writeRawRevision === undefined) {
        context.skip();
        return;
      }
      await body(harness.repository, harness.writeRawRevision);
    } finally {
      await harness.close();
    }
  };

  const withMissingMetaHarness = async (
    context: SkippableTestContext,
    body: (repository: SpaceRepository, removeMetaIdentity: () => Promise<void>) => Promise<void>,
  ) => {
    const harness = await createHarness();
    try {
      if (harness.removeMetaIdentity === undefined) {
        context.skip();
        return;
      }
      await body(harness.repository, harness.removeMetaIdentity);
    } finally {
      await harness.close();
    }
  };

  const withReopenHarness = async (
    context: SkippableTestContext,
    body: (repository: SpaceRepository, reopen: () => Promise<SpaceRepository>) => Promise<void>,
  ) => {
    const harness = await createHarness();
    try {
      if (harness.reopenRepository === undefined) {
        context.skip();
        return;
      }
      await body(harness.repository, harness.reopenRepository);
    } finally {
      await harness.close();
    }
  };

  const withBrokenStateHarness = async (
    context: SkippableTestContext,
    body: (
      repository: SpaceRepository,
      arrange: NonNullable<RepositoryHarness['arrangeBrokenState']>,
    ) => Promise<void>,
  ) => {
    const harness = await createHarness();
    try {
      if (harness.arrangeBrokenState === undefined) {
        context.skip();
        return;
      }
      await body(harness.repository, harness.arrangeBrokenState);
    } finally {
      await harness.close();
    }
  };

  const seed = async (repository: SpaceRepository, ...spaces: readonly SpaceSnapshot[]) => {
    const meta = spaces[0];
    if (meta === undefined) throw new Error('Seeding needs at least a Meta Space');
    const result = await repository.initializeAggregate({ metaSpaceId: meta.id, spaces });
    if (result.kind !== 'initialized') throw new Error(`Seeding failed: ${result.kind}`);
    return result.aggregate.spaces;
  };

  it(`${name} preserves the established aggregate across a fresh repository host`, async (context) => {
    await withReopenHarness(context, async (repository, reopen) => {
      const first = space(SPACE_ID, 'Durable', [RESOURCE_ID]);
      await seed(repository, first);

      const reopened = await reopen();
      await expect(reopened.loadAggregate()).resolves.toEqual({
        kind: 'loaded',
        aggregate: { metaSpaceId: SPACE_ID, spaces: [stored(first, 0n, null)] },
      });
    });
  });

  it(`${name} persists first-working-load initialization for a fresh repository host`, async (context) => {
    await withReopenHarness(context, async (repository, reopen) => {
      const initial = space(SPACE_ID, 'Mapless', [RESOURCE_ID]);
      await seed(repository, initial);
      const ids = [MAP_ID, GRAPH_ID];
      const first = await createWorkingSpaceLoader(repository, () => {
        const id = ids.shift();
        if (id === undefined) throw new Error('initializer minted too many identities');
        return id;
      })(SPACE_ID);

      expect(first).toMatchObject({ revision: 1n });
      expect(first?.snapshot.document.maps?.[0]).toMatchObject({
        id: MAP_ID,
        positions: {},
        activeGraph: GRAPH_ID,
      });

      const reopened = await reopen();
      await expect(
        createWorkingSpaceLoader(reopened, () => {
          throw new Error('an initialized Space must not mint identities');
        })(SPACE_ID),
      ).resolves.toEqual({
        snapshot: first?.snapshot,
        revision: 1n,
        exportedRevision: null,
      });
    });
  });

  for (const brokenState of ['invalid-space-document', 'invalid-aggregate'] as const) {
    it(`${name} replaces ${brokenState} stored state through the destructive lifecycle door`, async (context) => {
      await withBrokenStateHarness(context, async (repository, arrange) => {
        const { expectedMetaSpaceId } = await arrange(brokenState, {
          spaceId: SPACE_ID,
          otherSpaceId: OTHER_SPACE_ID,
        });
        const replacement = space(SPACE_ID, 'Replacement', [RESOURCE_ID]);

        await expect(repository.loadAggregate()).rejects.toThrow(AggregateInvariantError);
        await expect(
          repository.initializeAggregate({ metaSpaceId: SPACE_ID, spaces: [replacement] }),
        ).rejects.toThrow(AggregateInvariantError);
        await expect(
          repository.replaceAggregate(
            { metaSpaceId: SPACE_ID, spaces: [replacement] },
            expectedMetaSpaceId,
          ),
        ).resolves.toMatchObject({ kind: 'replaced' });
        await expect(repository.loadAggregate()).resolves.toEqual({
          kind: 'loaded',
          aggregate: { metaSpaceId: SPACE_ID, spaces: [stored(replacement, 0n, null)] },
        });
      });
    });
  }

  // Ticket 31. A stored document that fails its schema is broken stored state
  // whichever commit path meets it: the complete-aggregate path always named
  // it so (`#loadEverySpace`), and the single-Space fast path now does too,
  // rather than letting the parse error escape unclassified and reach the
  // commit route as whatever the route did by default. `loadSpace` keeps the
  // narrower answer deliberately (ticket 27): one Space failing intake is
  // that resource's answer to give, not evidence the aggregate cannot be read.
  it(`${name} names a broken stored document broken stored state on the single-Space fast path, and leaves loadSpace's answer narrower`, async (context) => {
    await withBrokenStateHarness(context, async (repository, arrange) => {
      await arrange('invalid-space-document', {
        spaceId: SPACE_ID,
        otherSpaceId: OTHER_SPACE_ID,
      });
      const repaired = space(SPACE_ID, 'Repaired', []);

      await expect(repository.loadSpace(SPACE_ID)).rejects.not.toBeInstanceOf(
        AggregateInvariantError,
      );
      await expect(commitUpdate(repository, repaired, 0n)).rejects.toThrow(AggregateInvariantError);
    });
  });

  it(`${name} truncates stored Spaces without a Meta identity only when none was expected`, async (context) => {
    await withMissingMetaHarness(context, async (repository, removeMetaIdentity) => {
      const orphan = space(OTHER_SPACE_ID, 'Orphan', [OTHER_RESOURCE_ID]);
      await seed(repository, orphan);
      await removeMetaIdentity();
      const replacement = space(SPACE_ID, 'Replacement', [RESOURCE_ID]);

      await expect(repository.loadAggregate()).rejects.toThrow(AggregateInvariantError);
      await expect(
        repository.replaceAggregate(
          { metaSpaceId: SPACE_ID, spaces: [replacement] },
          OTHER_SPACE_ID,
        ),
      ).resolves.toEqual({ kind: 'conflict', currentMetaSpaceId: undefined });
      await expect(
        repository.replaceAggregate({ metaSpaceId: SPACE_ID, spaces: [replacement] }, undefined),
      ).resolves.toMatchObject({ kind: 'replaced' });
    });
  });

  it(`${name} initializes and replaces only through explicit Meta-rooted aggregates`, async () => {
    await withHarness(async (repository) => {
      const first = space(SPACE_ID, 'One', [RESOURCE_ID]);
      await expect(repository.loadAggregate()).resolves.toEqual({ kind: 'uninitialized' });
      await expect(
        repository.initializeAggregate({ metaSpaceId: SPACE_ID, spaces: [first] }),
      ).resolves.toEqual({
        kind: 'initialized',
        aggregate: { metaSpaceId: SPACE_ID, spaces: [stored(first, 0n, null)] },
      });
      await expect(
        repository.initializeAggregate({
          metaSpaceId: SPACE_ID,
          spaces: [structuredClone(first)],
        }),
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

  it(`${name} classifies canonical and different initialization proposals`, async () => {
    await withHarness(async (repository) => {
      const child = targetSpace(OTHER_SPACE_ID, 'Child', [OTHER_RESOURCE_ID]);
      const meta = {
        ...space(SPACE_ID, 'Meta', [RESOURCE_ID]),
        resources: [
          resource(RESOURCE_ID, 'Meta resource'),
          spaceResource(LINK_RESOURCE_ID, OTHER_SPACE_ID, { map: MAP_ID, graph: GRAPH_ID }),
        ],
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
    });
  });

  it(`${name} refuses a replacement proposal naming a Meta Space it does not hold`, async () => {
    await withHarness(async (repository) => {
      const child = targetSpace(OTHER_SPACE_ID, 'Child', [OTHER_RESOURCE_ID]);
      const meta = {
        ...space(SPACE_ID, 'Meta', [RESOURCE_ID]),
        resources: [
          resource(RESOURCE_ID, 'Meta resource'),
          spaceResource(LINK_RESOURCE_ID, OTHER_SPACE_ID, { map: MAP_ID, graph: GRAPH_ID }),
        ],
      };
      await seed(repository, meta, child);

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
  });

  it(`${name} lets only one different concurrent initialization establish state`, async () => {
    await withHarness(async (repository) => {
      const first = space(SPACE_ID, 'First', [RESOURCE_ID]);
      const second = space(OTHER_SPACE_ID, 'Second', [OTHER_RESOURCE_ID]);
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
      const initial = space(SPACE_ID, 'Initial', [RESOURCE_ID]);
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
      const meta = space(SPACE_ID, 'Meta', [RESOURCE_ID]);
      for (const expected of [SPACE_ID, undefined]) {
        await expect(
          repository.replaceAggregate({ metaSpaceId: SPACE_ID, spaces: [meta] }, expected),
        ).resolves.toEqual({ kind: 'uninitialized' });
      }
      await expect(repository.loadAggregate()).resolves.toEqual({ kind: 'uninitialized' });
    });
  });

  it(`${name} reads the stored Meta identity as each lifecycle door leaves it`, async () => {
    await withHarness(async (repository) => {
      await expect(repository.loadMetaSpaceId()).resolves.toBeUndefined();
      await repository.initializeAggregate({
        metaSpaceId: SPACE_ID,
        spaces: [space(SPACE_ID, 'Meta', [RESOURCE_ID])],
      });
      await expect(repository.loadMetaSpaceId()).resolves.toBe(SPACE_ID);
      await repository.replaceAggregate(
        { metaSpaceId: OTHER_SPACE_ID, spaces: [space(OTHER_SPACE_ID, 'Other', [])] },
        SPACE_ID,
      );
      await expect(repository.loadMetaSpaceId()).resolves.toBe(OTHER_SPACE_ID);
    });
  });

  it(`${name} refuses a replacement expecting no Meta identity where one is stored`, async () => {
    await withHarness(async (repository) => {
      const initial = space(SPACE_ID, 'Initial', [RESOURCE_ID]);
      await repository.initializeAggregate({ metaSpaceId: SPACE_ID, spaces: [initial] });

      await expect(
        repository.replaceAggregate(
          { metaSpaceId: OTHER_SPACE_ID, spaces: [space(OTHER_SPACE_ID, 'Other', [])] },
          undefined,
        ),
      ).resolves.toEqual({ kind: 'conflict', currentMetaSpaceId: SPACE_ID });
      await expect(repository.loadMetaSpaceId()).resolves.toBe(SPACE_ID);
    });
  });

  it(`${name} refuses a replacement authorized against a superseded Meta identity`, async () => {
    await withHarness(async (repository) => {
      const initial = space(SPACE_ID, 'Initial', [RESOURCE_ID]);
      const first = space(OTHER_SPACE_ID, 'First replacement', [OTHER_RESOURCE_ID]);
      const second = space(MISSING_SPACE_ID, 'Second replacement', [MISSING_RESOURCE_ID]);
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

  it(`${name} refuses to record an exported revision for a Space it does not store`, async () => {
    await withHarness(async (repository) => {
      await expect(repository.markExported(MISSING_SPACE_ID, 0n)).rejects.toThrow(
        `Space ${MISSING_SPACE_ID} does not exist`,
      );
    });
  });

  it(`${name} refuses an aggregate that repeats a Space identity, storing none of it`, async () => {
    await withHarness(async (repository) => {
      const spaces = [
        space(SPACE_ID, 'First', [RESOURCE_ID]),
        space(SPACE_ID, 'Repeat', [OTHER_RESOURCE_ID]),
      ];

      const result = await repository.initializeAggregate({ metaSpaceId: SPACE_ID, spaces });
      expect(result.kind).toBe('aggregate-refused');
      if (result.kind !== 'aggregate-refused') throw new Error(result.kind);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ kind: 'duplicate-space-id', spaceId: SPACE_ID }),
      );
      expect(await repository.listSpaces()).toEqual([]);
    });
  });

  /*
   * A Resource belongs to exactly one Space of the aggregate, and an aggregate
   * that says otherwise is refused whole. There is no longer a second,
   * insert-only reading in which a proposal collides with a Resource some
   * *surviving stored* Space owns: both lifecycle doors take the aggregate
   * entire, so what is stored after the call is what the call proposed, and
   * ownership is settled inside that proposal alone (ADR 0078). The two
   * distinct codes this pair of cases used to hold apart went with it.
   */
  it(`${name} refuses an aggregate that repeats a Resource identity, storing none of it`, async () => {
    await withHarness(async (repository) => {
      const spaces = [
        space(SPACE_ID, 'First', [RESOURCE_ID]),
        space(OTHER_SPACE_ID, 'Second', [RESOURCE_ID]),
      ];

      const result = await repository.initializeAggregate({ metaSpaceId: SPACE_ID, spaces });
      expect(result.kind).toBe('aggregate-refused');
      if (result.kind !== 'aggregate-refused') throw new Error(result.kind);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ kind: 'duplicate-resource-id', resourceId: RESOURCE_ID }),
      );
      expect(await repository.listSpaces()).toEqual([]);
    });
  });

  it(`${name} refuses an initialization that fails domain intake, storing none of it`, async () => {
    await withHarness(async (repository) => {
      const valid = space(SPACE_ID, 'Must roll back', [RESOURCE_ID]);
      const dangling = spaceWithDanglingEdge(OTHER_SPACE_ID, 'Dangling', OTHER_RESOURCE_ID);

      await expect(
        repository.initializeAggregate({ metaSpaceId: SPACE_ID, spaces: [valid, dangling] }),
      ).resolves.toMatchObject({ kind: 'aggregate-refused' });
      // A refusal stores none of what it was offered, not even the Space that
      // would have loaded on its own.
      expect(await repository.listSpaces()).toEqual([]);
    });
  });

  /*
   * Replacement drops every stored Space, so a Resource a doomed Space owns is free
   * for the replacement to claim. Ownership is judged against what the
   * replacement proposes, never against what the same call is about to delete —
   * which is what taking the aggregate entire buys over inserting into whatever
   * is already there.
   */
  it(`${name} replaces everything stored, freeing the Resource ids it clears`, async () => {
    await withHarness(async (repository) => {
      await seed(repository, space(SPACE_ID, 'Cleared', [RESOURCE_ID]));
      const replacement = space(OTHER_SPACE_ID, 'Replacement', [RESOURCE_ID]);

      await expect(
        repository.replaceAggregate(
          { metaSpaceId: OTHER_SPACE_ID, spaces: [replacement] },
          SPACE_ID,
        ),
      ).resolves.toEqual({
        kind: 'replaced',
        aggregate: { metaSpaceId: OTHER_SPACE_ID, spaces: [stored(replacement, 0n, null)] },
      });
      await expect(repository.loadSpace(SPACE_ID)).resolves.toBeUndefined();
      expect(new Set(await repository.listSpaces())).toEqual(
        new Set([{ id: OTHER_SPACE_ID, title: 'Replacement' }]),
      );
    });
  });

  // Ticket 27 proved this for SQLite, whose TEXT column always could hold a
  // non-canonical revision; ADR 0095's TEXT columns make it reachable on
  // PostgreSQL too, so it belongs here rather than in one database's own
  // integration file.
  it(`${name} raises an identifiable invariant failure for a stored Space whose revision is not canonical`, async (context) => {
    await withRawRevisionHarness(context, async (repository, writeRawRevision) => {
      const first = space(SPACE_ID, 'One', [RESOURCE_ID]);
      await seed(repository, first);
      await writeRawRevision({ spaceId: SPACE_ID, revision: '01' });

      await expect(repository.loadAggregate()).rejects.toThrow(AggregateInvariantError);
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
      const first = space(SPACE_ID, 'One', [RESOURCE_ID]);
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

  it(`${name} refuses a topology-preserving update when stored Spaces have no Meta identity`, async (context) => {
    await withMissingMetaHarness(context, async (repository, removeMetaIdentity) => {
      const first = space(SPACE_ID, 'One', [RESOURCE_ID]);
      await seed(repository, first);
      await removeMetaIdentity();

      await expect(commitUpdate(repository, retitled(first, 'Changed'), 0n)).resolves.toEqual({
        kind: 'rejected',
        code: 'invalid-commit',
        message: 'The repository has no Meta Space',
      });
      await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual(stored(first, 0n, null));
    });
  });

  it(`${name} stores an initialized Space, then lists, loads and commits it`, async () => {
    await withHarness(async (repository) => {
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

      const changed = retitled(first, 'Changed');
      await expect(commitUpdate(repository, changed, 0n)).resolves.toEqual({
        kind: 'committed',
        revisions: [{ spaceId: SPACE_ID, revision: 1n }],
        deletedSpaceIds: [],
      });
      await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual(stored(changed, 1n, null));
    });
  });

  it(`${name} keeps an Edge's Title and hidden flag through initialization, commit and load`, async () => {
    await withHarness(async (repository) => {
      const withEdge = (edge: GraphEdge): SpaceSnapshot => {
        const base = graphedSpace(SPACE_ID, 'Titled', [RESOURCE_ID, SECOND_RESOURCE_ID]);
        return {
          ...base,
          document: {
            ...base.document,
            maps: (base.document.maps ?? []).map((map) => ({
              ...map,
              graphs: map.graphs.map((graph) => ({ ...graph, edges: [edge] })),
            })),
          },
        };
      };
      const hidden = withEdge({
        from: RESOURCE_ID,
        to: SECOND_RESOURCE_ID,
        title: 'On success',
        titleHidden: true,
      });

      await repository.initializeAggregate({ metaSpaceId: SPACE_ID, spaces: [hidden] });
      await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual(stored(hidden, 0n, null));

      const shown = withEdge({ from: RESOURCE_ID, to: SECOND_RESOURCE_ID, title: 'On failure' });
      await expect(commitUpdate(repository, shown, 0n)).resolves.toMatchObject({
        kind: 'committed',
      });
      await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual(stored(shown, 1n, null));
      await expect(repository.loadAggregate()).resolves.toEqual({
        kind: 'loaded',
        aggregate: { metaSpaceId: SPACE_ID, spaces: [stored(shown, 1n, null)] },
      });
    });
  });

  /*
   * On the SQL repository (`sql-space-repository.ts`, ticket 24), the shared
   * `#writeUpdate` helper runs an unconditional `deleteExcept` after every
   * update it writes, including on the fast path -- whose own
   * `preservesSnapshotBoundary` never lets the Resource set change before
   * reaching it, so that delete keeps nothing out there either. Nothing in
   * this case forces that path, though: on the memory double it never reaches
   * `#writeUpdate` at all. What every implementation is held to, whichever
   * path it takes, is the invariant itself: a topology-preserving commit over
   * several Resources, changing none of their membership, leaves every one of
   * them in place.
   */
  it(`${name} keeps every Resource through a topology-preserving commit's own delete`, async () => {
    await withHarness(async (repository) => {
      const first = space(SPACE_ID, 'Three resources', [
        RESOURCE_ID,
        SECOND_RESOURCE_ID,
        OTHER_RESOURCE_ID,
      ]);
      await seed(repository, first);

      const changed = retitled(first, 'Renamed, same Resources');
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
      const target = targetSpace(OTHER_SPACE_ID, 'Target', [OTHER_RESOURCE_ID]);
      const linkedMeta: SpaceSnapshot = {
        ...space(SPACE_ID, 'Meta', [RESOURCE_ID]),
        resources: [
          resource(RESOURCE_ID, 'Meta resource'),
          spaceResource(SECOND_RESOURCE_ID, OTHER_SPACE_ID, { map: MAP_ID, graph: GRAPH_ID }),
        ],
      };
      await seed(repository, linkedMeta, target);

      const unlinked = { ...linkedMeta, resources: [resource(RESOURCE_ID, 'Meta resource')] };
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
      const meta = space(SPACE_ID, 'Meta', [RESOURCE_ID]);
      await seed(repository, meta);
      const child = targetSpace(OTHER_SPACE_ID, 'Child', [OTHER_RESOURCE_ID]);
      const linked = {
        ...meta,
        resources: [
          ...meta.resources,
          spaceResource(SECOND_RESOURCE_ID, OTHER_SPACE_ID, { map: MAP_ID, graph: GRAPH_ID }),
          spaceResource(LINK_RESOURCE_ID, OTHER_SPACE_ID, { map: MAP_ID, graph: GRAPH_ID }),
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
        resources: [
          ...meta.resources,
          spaceResource(LINK_RESOURCE_ID, OTHER_SPACE_ID, { map: MAP_ID, graph: GRAPH_ID }),
        ],
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

  it(`${name} refuses an authored commit that deletes the Meta Space`, async () => {
    await withHarness(async (repository) => {
      const meta = space(SPACE_ID, 'Meta', [RESOURCE_ID]);
      await seed(repository, meta);

      // The one Space no Space Resource creates and no deletion reaches. A commit
      // that removes it leaves an aggregate the Meta identity no longer names,
      // which complete intake refuses by identity rather than by cardinality.
      await expect(
        repository.commit({
          changes: [{ kind: 'delete', spaceId: SPACE_ID, expectedRevision: 0n }],
        }),
      ).resolves.toMatchObject({
        kind: 'aggregate-refused',
        errors: [{ kind: 'meta-space-missing', metaSpaceId: SPACE_ID }],
      });
      await expect(repository.loadAggregate()).resolves.toEqual({
        kind: 'loaded',
        aggregate: { metaSpaceId: SPACE_ID, spaces: [stored(meta, 0n, null)] },
      });
    });
  });

  it(`${name} keeps each Space Resource's own selection across a later default Map change`, async () => {
    await withHarness(async (repository) => {
      const meta = space(SPACE_ID, 'Meta', [RESOURCE_ID]);
      await seed(repository, meta);
      const target: SpaceSnapshot = {
        ...space(OTHER_SPACE_ID, 'Target', [OTHER_RESOURCE_ID]),
        document: {
          version: 1,
          title: 'Target',
          defaultMap: MAP_ID,
          maps: [
            {
              id: MAP_ID,
              title: 'First map',
              kind: 'positioned',
              positions: { [OTHER_RESOURCE_ID]: { x: 0, y: 0, open: false } },
              graphs: [
                { id: GRAPH_ID, title: 'First graph', edges: [] },
                { id: THIRD_GRAPH_ID, title: 'Second graph', edges: [] },
              ],
              activeGraph: GRAPH_ID,
            },
            {
              id: SECOND_MAP_ID,
              title: 'Second map',
              kind: 'positioned',
              positions: { [OTHER_RESOURCE_ID]: { x: 100, y: 100, open: false } },
              graphs: [
                { id: SECOND_GRAPH_ID, title: 'Third graph', edges: [] },
                { id: FOURTH_GRAPH_ID, title: 'Fourth graph', edges: [] },
              ],
              activeGraph: SECOND_GRAPH_ID,
            },
          ],
        },
      };
      /*
       * Four Space Resources on one target, no two selecting the same pair. Two
       * share a Map and differ by Graph, two share the other Map and
       * differ by Graph, so the round trip has to carry both halves of a
       * selection rather than a Map with a Graph implied by it (ADR 0026).
       */
      const onDefaultMap = spaceResource(SECOND_RESOURCE_ID, OTHER_SPACE_ID, {
        map: MAP_ID,
        graph: GRAPH_ID,
      });
      const onDefaultMapAtAnotherGraph = spaceResource(LINK_RESOURCE_ID, OTHER_SPACE_ID, {
        map: MAP_ID,
        graph: THIRD_GRAPH_ID,
      });
      const onSecondMap = spaceResource(THIRD_SPACE_RESOURCE_ID, OTHER_SPACE_ID, {
        map: SECOND_MAP_ID,
        graph: SECOND_GRAPH_ID,
      });
      const onSecondMapAtAnotherGraph = spaceResource(FOURTH_SPACE_RESOURCE_ID, OTHER_SPACE_ID, {
        map: SECOND_MAP_ID,
        graph: FOURTH_GRAPH_ID,
      });
      const linked = {
        ...meta,
        resources: [
          ...meta.resources,
          onDefaultMap,
          onDefaultMapAtAnotherGraph,
          onSecondMap,
          onSecondMapAtAnotherGraph,
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

      /*
       * The target changes the Map it opens on, and nothing else changes.
       * That commit stands alone: no Resource reads its selection through the
       * target's `defaultMap`, so moving the opening choice cannot invalidate
       * a Resource that chose the Map it is leaving (ADR 0079).
       */
      const retargetedDefault: SpaceSnapshot = {
        ...target,
        document: { ...target.document, defaultMap: SECOND_MAP_ID },
      };
      await expect(commitUpdate(repository, retargetedDefault, 0n)).resolves.toEqual({
        kind: 'committed',
        revisions: [{ spaceId: OTHER_SPACE_ID, revision: 1n }],
        deletedSpaceIds: [],
      });

      const result = await repository.loadAggregate();
      if (result.kind === 'uninitialized') throw new Error('Seeded repository is uninitialized');
      const aggregate = result.aggregate;
      expect(aggregate).toEqual({
        metaSpaceId: SPACE_ID,
        spaces: [stored(linked, 1n, null), stored(retargetedDefault, 1n, null)],
      });
      // Read back one at a time as well, and strictly: the whole-snapshot
      // comparison above would accept a `map` the adapter had quietly
      // rewritten to the target's new opening choice if every Resource agreed on
      // it, and it would accept an extra key alongside.
      const storedResources = aggregate.spaces[0]?.snapshot.resources ?? [];
      for (const authored of [
        onDefaultMap,
        onDefaultMapAtAnotherGraph,
        onSecondMap,
        onSecondMapAtAnotherGraph,
      ]) {
        expect(storedResources.find(({ id }) => id === authored.id)?.document).toStrictEqual(
          authored.document,
        );
      }
    });
  });

  it(`${name} reports every conflict and rolls back every refused aggregate`, async () => {
    await withHarness(async (repository) => {
      const meta = space(SPACE_ID, 'Meta', [RESOURCE_ID]);
      await seed(repository, meta);
      const orphan = space(OTHER_SPACE_ID, 'Orphan', [OTHER_RESOURCE_ID]);

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
      const first = space(SPACE_ID, 'One', [RESOURCE_ID]);
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
      const first = space(SPACE_ID, 'One', [RESOURCE_ID]);
      await seed(repository, first);
      const dangling = spaceWithDanglingEdge(SPACE_ID, 'One', RESOURCE_ID);

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
      const first = space(SPACE_ID, 'One', [RESOURCE_ID]);
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

  it(`${name} refuses an update whose snapshot names another stored Space at a matching revision`, async () => {
    await withHarness(async (repository) => {
      const target = targetSpace(OTHER_SPACE_ID, 'Target', [OTHER_RESOURCE_ID]);
      const linkedMeta: SpaceSnapshot = {
        ...space(SPACE_ID, 'Meta', [RESOURCE_ID]),
        resources: [
          resource(RESOURCE_ID, 'Meta resource'),
          spaceResource(SECOND_RESOURCE_ID, OTHER_SPACE_ID, { map: MAP_ID, graph: GRAPH_ID }),
        ],
      };
      await seed(repository, linkedMeta, target);

      // Both Spaces stand at revision 0, so a path that checked the revision of
      // the Space `spaceId` names and wrote the one the snapshot names would
      // overwrite the target.
      await expect(
        repository.commit({
          changes: [
            {
              kind: 'update',
              spaceId: SPACE_ID,
              snapshot: retitled(target, 'Overwritten'),
              expectedRevision: 0n,
            },
          ],
        }),
      ).resolves.toMatchObject({ kind: 'rejected', code: 'invalid-commit' });
      await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual(stored(linkedMeta, 0n, null));
      await expect(repository.loadSpace(OTHER_SPACE_ID)).resolves.toEqual(stored(target, 0n, null));
    });
  });

  it(`${name} places a single update's failed intake at its Space's position in the aggregate`, async () => {
    await withHarness(async (repository) => {
      const target = targetSpace(OTHER_SPACE_ID, 'Target', [OTHER_RESOURCE_ID]);
      const linkedMeta: SpaceSnapshot = {
        ...space(SPACE_ID, 'Meta', [RESOURCE_ID]),
        resources: [
          resource(RESOURCE_ID, 'Meta resource'),
          spaceResource(SECOND_RESOURCE_ID, OTHER_SPACE_ID, { map: MAP_ID, graph: GRAPH_ID }),
        ],
      };
      await seed(repository, linkedMeta, target);
      const dangling = spaceWithDanglingEdge(OTHER_SPACE_ID, 'Target', OTHER_RESOURCE_ID);

      // The refusal the complete-aggregate decision gives: the Target is the
      // second stored Space by id, so its snapshot is refused at index 1 rather
      // than at the 0 a decision over that Space alone would name.
      const complete = loadSpaceAggregate({
        metaSpaceId: SPACE_ID,
        snapshots: [linkedMeta, dangling],
      });
      if (complete.ok) throw new Error('The dangling Target must fail complete intake');
      expect(complete.errors).toContainEqual(
        expect.objectContaining({ kind: 'invalid-space-snapshot', snapshotIndex: 1 }),
      );

      await expect(commitUpdate(repository, dangling, 0n)).resolves.toEqual({
        kind: 'aggregate-refused',
        errors: complete.errors,
      });
      await expect(repository.loadSpace(OTHER_SPACE_ID)).resolves.toEqual(stored(target, 0n, null));
    });
  });

  it(`${name} refuses a commit that names one Space more than once`, async () => {
    await withHarness(async (repository) => {
      const first = space(SPACE_ID, 'One', [RESOURCE_ID]);
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

  it(`${name} refuses a commit claiming a Resource another Space owns`, async () => {
    await withHarness(async (repository) => {
      const first = space(SPACE_ID, 'One', [RESOURCE_ID]);
      const other = targetSpace(OTHER_SPACE_ID, 'Other', [OTHER_RESOURCE_ID]);
      const linked = {
        ...first,
        resources: [
          ...first.resources,
          spaceResource(LINK_RESOURCE_ID, OTHER_SPACE_ID, { map: MAP_ID, graph: GRAPH_ID }),
        ],
      };
      await seed(repository, linked, other);
      const claiming: SpaceSnapshot = {
        ...retitled(other, 'Must roll back'),
        resources: [...other.resources, resource(RESOURCE_ID, 'Claimed')],
      };

      await expect(commitUpdate(repository, claiming, 0n)).resolves.toMatchObject({
        kind: 'aggregate-refused',
      });
      await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual(stored(linked, 0n, null));
      await expect(repository.loadSpace(OTHER_SPACE_ID)).resolves.toEqual(stored(other, 0n, null));
    });
  });

  it(`${name} scopes Graph identities to their containing Space`, async () => {
    await withHarness(async (repository) => {
      const child = graphedSpace(OTHER_SPACE_ID, 'Child', [SECOND_RESOURCE_ID, OTHER_RESOURCE_ID], {
        graphTitle: 'Child graph',
      });
      const metaBase = graphedSpace(SPACE_ID, 'Meta', [RESOURCE_ID, MISSING_RESOURCE_ID], {
        graphTitle: 'Meta graph',
      });
      const metaFrom = metaBase.resources[0];
      const metaTo = metaBase.resources[1];
      if (metaFrom === undefined || metaTo === undefined) {
        throw new Error('Fixture requires two Resources');
      }
      const meta: SpaceSnapshot = {
        ...metaBase,
        resources: [
          metaFrom,
          spaceResource(LINK_RESOURCE_ID, OTHER_SPACE_ID, { map: MAP_ID, graph: GRAPH_ID }),
          metaTo,
        ],
      };

      await seed(repository, meta, child);
      await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual(stored(meta, 0n, null));
      await expect(repository.loadSpace(OTHER_SPACE_ID)).resolves.toEqual(stored(child, 0n, null));
    });
  });

  it(`${name} refuses an unreferenced ordinary Space even when its Graph identity is reused`, async () => {
    await withHarness(async (repository) => {
      const meta = graphedSpace(SPACE_ID, 'Meta', [RESOURCE_ID, MISSING_RESOURCE_ID]);
      const child = graphedSpace(OTHER_SPACE_ID, 'Child', [OTHER_RESOURCE_ID, SECOND_RESOURCE_ID]);

      await expect(
        repository.initializeAggregate({ metaSpaceId: SPACE_ID, spaces: [meta, child] }),
      ).resolves.toEqual({
        kind: 'aggregate-refused',
        errors: [{ kind: 'ordinary-space-unreferenced', spaceId: OTHER_SPACE_ID }],
      });
      await expect(repository.loadAggregate()).resolves.toEqual({ kind: 'uninitialized' });
    });
  });

  it(`${name} permits a Graph and Resource to share an identity`, async () => {
    await withHarness(async (repository) => {
      const shared = graphedSpace(SPACE_ID, 'Shared identity', [RESOURCE_ID, SECOND_RESOURCE_ID], {
        graphId: RESOURCE_ID,
      });

      await seed(repository, shared);
      await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual(stored(shared, 0n, null));
    });
  });

  it(`${name} refuses two Maps in one Space that own the same Graph identity`, async () => {
    await withHarness(async (repository) => {
      const first = graphedSpace(SPACE_ID, 'Duplicate graph', [RESOURCE_ID, SECOND_RESOURCE_ID]);
      const firstMap = first.document.maps?.[0];
      if (firstMap === undefined) throw new Error('Fixture requires its first Map');
      const colliding: SpaceSnapshot = {
        ...first,
        document: {
          ...first.document,
          maps: [
            firstMap,
            {
              ...firstMap,
              id: SECOND_MAP_ID,
              title: 'Second owner',
              activeGraph: GRAPH_ID,
            },
          ],
        },
      };

      await expect(
        repository.initializeAggregate({ metaSpaceId: SPACE_ID, spaces: [colliding] }),
      ).resolves.toMatchObject({
        kind: 'aggregate-refused',
        errors: [{ kind: 'invalid-space-snapshot', snapshotIndex: 0 }],
      });
      await expect(repository.loadAggregate()).resolves.toEqual({ kind: 'uninitialized' });
    });
  });

  it(`${name} keeps the Resources a commit names and drops the ones it omits`, async () => {
    await withHarness(async (repository) => {
      const first = space(SPACE_ID, 'One', [RESOURCE_ID, SECOND_RESOURCE_ID]);
      await seed(repository, first);
      const narrowed: SpaceSnapshot = { ...first, resources: [resource(RESOURCE_ID, 'Kept')] };

      await expect(commitUpdate(repository, narrowed, 0n)).resolves.toMatchObject({
        kind: 'committed',
      });
      await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual(stored(narrowed, 1n, null));
    });
  });

  it(`${name} drops every Resource when a commit omits them all`, async () => {
    await withHarness(async (repository) => {
      const first = space(SPACE_ID, 'One', [RESOURCE_ID, SECOND_RESOURCE_ID]);
      await seed(repository, first);
      const empty: SpaceSnapshot = { ...first, resources: [] };

      await expect(commitUpdate(repository, empty, 0n)).resolves.toMatchObject({
        kind: 'committed',
      });
      await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual(stored(empty, 1n, null));
    });
  });

  /*
   * `loadSpaceAggregate` orders the PostgreSQL aggregate's resources by id, on the
   * read inside an import transaction and on the one outside it alike, so
   * ascending id order is what every read path answers with — and the
   * whole-snapshot `toEqual` comparisons throughout this suite are
   * order-sensitive on that array. Supplied here in descending order, because
   * every other case supplies them already sorted, where an unordered
   * implementation passes. Both halves are asserted because both are reads:
   * the aggregate an initialization answers with, and the Space loaded after a
   * commit.
   */
  it(`${name} returns a Space's Resources in ascending id order however they were supplied`, async () => {
    await withHarness(async (repository) => {
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

      await expect(commitUpdate(repository, descending, 0n)).resolves.toMatchObject({
        kind: 'committed',
      });
      await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual(stored(ascending, 1n, null));
    });
  });

  it(`${name} records an exported revision and carries it across later commits`, async () => {
    await withHarness(async (repository) => {
      const first = space(SPACE_ID, 'One', [RESOURCE_ID]);
      await seed(repository, first);

      await repository.markExported(SPACE_ID, 0n);
      const changed = retitled(first, 'Edited after export');
      await expect(commitUpdate(repository, changed, 0n)).resolves.toMatchObject({
        kind: 'committed',
      });

      await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual(stored(changed, 1n, 0n));
    });
  });

  it(`${name} refuses to mark an exported revision above the storage ceiling`, async (context) => {
    await withRawRevisionHarness(context, async (repository) => {
      const first = space(SPACE_ID, 'One', [RESOURCE_ID]);
      await seed(repository, first);
      await expect(repository.markExported(SPACE_ID, REVISION_CEILING + 1n)).rejects.toThrow();
      await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual(stored(first, 0n, null));
    });
  });

  // Revisions above `Number.MAX_SAFE_INTEGER` are ordinary once a database
  // stores them as text rather than a native integer (ADR 0095) — both
  // databases hold and round-trip one identically now, so this is shared
  // rather than PostgreSQL's own weaker "the expected revision isn't
  // narrowed" case and SQLite's two ("speaks bigint at the repository
  // boundary…", "commits and reloads revisions above…").
  it(`${name} stores and commits a revision above Number.MAX_SAFE_INTEGER as canonical decimal text`, async (context) => {
    await withRawRevisionHarness(context, async (repository, writeRawRevision) => {
      const first = space(SPACE_ID, 'One', [RESOURCE_ID]);
      await seed(repository, first);
      const aboveSafe = BigInt(Number.MAX_SAFE_INTEGER) + 1n;
      await writeRawRevision({ spaceId: SPACE_ID, revision: aboveSafe.toString() });

      await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual(stored(first, aboveSafe, null));

      const changed = retitled(first, 'Above safe');
      await expect(commitUpdate(repository, changed, aboveSafe)).resolves.toEqual({
        kind: 'committed',
        revisions: [{ spaceId: SPACE_ID, revision: aboveSafe + 1n }],
        deletedSpaceIds: [],
      });
      await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual(
        stored(changed, aboveSafe + 1n, null),
      );
    });
  });

  // The shared codec refuses a revision past 2^63−1 on the way out just as it
  // does on the way in (ADR 0095): a Space already sitting at the ceiling —
  // constructed here the only way one legitimately could, since no ordinary
  // commit ever reaches it — refuses the commit that would carry it one past
  // rather than storing a value the codec could not read back. The failure is
  // named (`AggregateInvariantError`, the same identity a stored row that
  // fails intake raises) rather than merely asserted to exist, and the
  // refused commit is proven to have left the stored revision exactly where
  // it was — "refused rather than stored".
  it(`${name} refuses to store a revision above the 2^63-1 ceiling`, async (context) => {
    await withRawRevisionHarness(context, async (repository, writeRawRevision) => {
      const first = space(SPACE_ID, 'One', [RESOURCE_ID]);
      await seed(repository, first);
      await writeRawRevision({ spaceId: SPACE_ID, revision: REVISION_CEILING.toString() });

      await expect(
        commitUpdate(repository, retitled(first, 'Past the ceiling'), REVISION_CEILING),
      ).rejects.toThrow(AggregateInvariantError);
      await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual(
        stored(first, REVISION_CEILING, null),
      );
    });
  });

  // The codec's ceiling applies to a value already sitting in the column, not
  // only to one a commit would produce: a stored revision past 2^63−1 is
  // broken stored state exactly as a non-canonical one is (the case above
  // this one), and an aggregate read of it raises the same identity.
  it(`${name} raises an identifiable invariant failure for a stored Space whose revision exceeds the 2^63-1 ceiling`, async (context) => {
    await withRawRevisionHarness(context, async (repository, writeRawRevision) => {
      const first = space(SPACE_ID, 'One', [RESOURCE_ID]);
      await seed(repository, first);
      await writeRawRevision({ spaceId: SPACE_ID, revision: (REVISION_CEILING + 1n).toString() });

      await expect(repository.loadAggregate()).rejects.toThrow(AggregateInvariantError);
    });
  });

  // `commit`'s fast path decides against the one stored Space its candidate
  // names, read through the same decode step `#loadEverySpace`'s aggregate
  // read uses for a revision -- so a non-canonical stored revision met there
  // is broken stored state exactly as it is on the aggregate path, and has to
  // raise the same identity rather than the shared codec's bare error
  // escaping the commit unclassified.
  it(`${name} raises an identifiable invariant failure for a commit whose fast-path candidate has a non-canonical stored revision`, async (context) => {
    await withRawRevisionHarness(context, async (repository, writeRawRevision) => {
      const first = space(SPACE_ID, 'One', [RESOURCE_ID]);
      await seed(repository, first);
      await writeRawRevision({ spaceId: SPACE_ID, revision: '01' });

      await expect(commitUpdate(repository, retitled(first, 'Changed'), 0n)).rejects.toThrow(
        AggregateInvariantError,
      );
    });
  });
};
