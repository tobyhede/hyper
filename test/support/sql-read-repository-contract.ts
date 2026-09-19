import { uuidSchema, type SpaceSnapshot, type UUID } from '@project/core';
import type { LoadedSpace, SpaceSummary } from '@project/persistence';
import { expect, it } from 'vitest';
import type { SpaceRepository } from '../../src/persistence/space-repository';

/**
 * The behaviour ticket 22's tracer slice of the one SQL repository owes
 * `listSpaces` and `loadSpace` callers, run against both databases (ADR
 * 0095). Seeding runs through the existing full adapter — the one SQL
 * repository has no lifecycle door of its own yet (tickets 23–24) — and
 * every assertion here reads back through the tracer repository instead, so
 * this is where its typing and behaviour are actually proven rather than
 * merely compiling.
 */
export interface SqlReadRepository {
  listSpaces(): Promise<readonly SpaceSummary[]>;
  loadSpace(id: UUID): Promise<LoadedSpace | undefined>;
}

export interface SqlReadRepositoryHarness {
  /** The existing full adapter, used only to seed stored state. */
  readonly seed: SpaceRepository;
  /** The one SQL repository's tracer slice, under test. */
  readonly read: SqlReadRepository;
  close(): Promise<void>;
}

const SPACE_ID = uuidSchema.parse('d0000000-0000-4000-8000-000000000001');
const OTHER_SPACE_ID = uuidSchema.parse('d0000000-0000-4000-8000-000000000002');
const MISSING_SPACE_ID = uuidSchema.parse('d0000000-0000-4000-8000-000000000003');
const THING_ID = uuidSchema.parse('d0000000-0000-4000-8000-000000000010');
const SECOND_THING_ID = uuidSchema.parse('d0000000-0000-4000-8000-000000000011');
const OTHER_THING_ID = uuidSchema.parse('d0000000-0000-4000-8000-000000000012');
const LINK_THING_ID = uuidSchema.parse('d0000000-0000-4000-8000-000000000013');
const GRAPH_ID = uuidSchema.parse('d0000000-0000-4000-8000-000000000020');
const DIAGRAM_ID = uuidSchema.parse('d0000000-0000-4000-8000-000000000021');

const thing = (id: UUID, title: string) => ({
  id,
  document: { title, kind: 'markdown' as const, body: title },
});

const space = (id: UUID, title: string, thingIds: readonly UUID[]): SpaceSnapshot => ({
  id,
  document: { version: 1 as const, title },
  things: thingIds.map((thingId) => thing(thingId, `${title} thing`)),
});

/**
 * A Space complete enough to be pointed at: one positioned Diagram owning
 * one Graph, the least a Space Thing's selection can resolve against (ADR
 * 0079) — `test/support/repository-contract.ts`'s `targetSpace` mirrored
 * here rather than shared, since this contract is deliberately small.
 */
const targetSpace = (id: UUID, title: string, thingIds: readonly UUID[]): SpaceSnapshot => ({
  ...space(id, title, thingIds),
  document: {
    version: 1,
    title,
    defaultDiagram: DIAGRAM_ID,
    diagrams: [
      {
        id: DIAGRAM_ID,
        title: 'Diagram 1',
        kind: 'positioned',
        positions: {},
        graphs: [{ id: GRAPH_ID, title: 'Graph 1', edges: [] }],
        activeGraph: GRAPH_ID,
      },
    ],
  },
});

/** A Space Thing in the Meta Space, referencing `target` — what keeps an ordinary Space out of `ordinary-space-unreferenced`. */
const spaceThing = (id: UUID, target: UUID) => ({
  id,
  document: {
    title: `Open ${target}`,
    kind: 'space' as const,
    spaceId: target,
    diagram: DIAGRAM_ID,
    graph: GRAPH_ID,
  },
});

export const sqlReadRepositoryContract = (
  name: string,
  createHarness: () => Promise<SqlReadRepositoryHarness>,
): void => {
  const withHarness = async (body: (harness: SqlReadRepositoryHarness) => Promise<void>) => {
    const harness = await createHarness();
    try {
      await body(harness);
    } finally {
      await harness.close();
    }
  };

  it(`${name} lists every seeded Space`, async () => {
    await withHarness(async ({ seed, read }) => {
      const second = targetSpace(OTHER_SPACE_ID, 'Two', [OTHER_THING_ID]);
      const first: SpaceSnapshot = {
        ...space(SPACE_ID, 'One', [THING_ID]),
        things: [thing(THING_ID, 'One thing'), spaceThing(LINK_THING_ID, OTHER_SPACE_ID)],
      };
      await seed.initializeAggregate({ metaSpaceId: SPACE_ID, spaces: [first, second] });

      expect(new Set(await read.listSpaces())).toEqual(
        new Set([
          { id: SPACE_ID, title: 'One' },
          { id: OTHER_SPACE_ID, title: 'Two' },
        ]),
      );
    });
  });

  it(`${name} answers undefined for a Space it does not store`, async () => {
    await withHarness(async ({ seed, read }) => {
      await seed.initializeAggregate({
        metaSpaceId: SPACE_ID,
        spaces: [space(SPACE_ID, 'One', [THING_ID])],
      });

      await expect(read.loadSpace(MISSING_SPACE_ID)).resolves.toBeUndefined();
    });
  });

  it(`${name} loads a Space with its Things in ascending id order however they were supplied`, async () => {
    await withHarness(async ({ seed, read }) => {
      const descending = space(SPACE_ID, 'Unordered', [OTHER_THING_ID, SECOND_THING_ID, THING_ID]);
      const ascending = space(SPACE_ID, 'Unordered', [THING_ID, SECOND_THING_ID, OTHER_THING_ID]);
      await seed.initializeAggregate({ metaSpaceId: SPACE_ID, spaces: [descending] });

      await expect(read.loadSpace(SPACE_ID)).resolves.toEqual({
        snapshot: ascending,
        revision: 0n,
        exportedRevision: null,
      });
    });
  });

  it(`${name} reads a Space's current revision after a later commit`, async () => {
    await withHarness(async ({ seed, read }) => {
      const first = space(SPACE_ID, 'One', [THING_ID]);
      await seed.initializeAggregate({ metaSpaceId: SPACE_ID, spaces: [first] });
      const changed = { ...first, document: { ...first.document, title: 'Changed' } };
      await seed.commit({
        changes: [{ kind: 'update', spaceId: SPACE_ID, snapshot: changed, expectedRevision: 0n }],
      });

      await expect(read.loadSpace(SPACE_ID)).resolves.toEqual({
        snapshot: changed,
        revision: 1n,
        exportedRevision: null,
      });
    });
  });

  it(`${name} reads a Space's exported revision once one is recorded`, async () => {
    await withHarness(async ({ seed, read }) => {
      const first = space(SPACE_ID, 'One', [THING_ID]);
      await seed.initializeAggregate({ metaSpaceId: SPACE_ID, spaces: [first] });
      await seed.markExported(SPACE_ID, 0n);

      await expect(read.loadSpace(SPACE_ID)).resolves.toEqual({
        snapshot: first,
        revision: 0n,
        exportedRevision: 0n,
      });
    });
  });
};
