import fc from 'fast-check';
import { uuidSchema, type SpaceSnapshot, type UUID } from '@project/core';
import {
  MemorySpaceBackend,
  type AggregateLoadResult,
  type CommitResult,
  type LoadedAggregate,
  type RepositoryCommitResult,
  type SpaceChange,
  type SpaceCommit,
} from '@project/persistence';
import { expect } from 'vitest';
import type { SpaceRepository } from '../../src/persistence/space-repository';

/*
 * Memory and the one SQL repository (ADR 0095) run the same commit decision,
 * `decideCommit` in `@project/persistence`, so this no longer proves two sets
 * of rules agree. It proves storage agrees: that what each reads, in what
 * order, and what each writes and answers around that one decision come out
 * the same over generated aggregates -- run against both databases
 * `SqlSpaceRepository` serves, since each supplies its own `SqlStore` and
 * this differential is exactly where the two could still disagree.
 *
 * `assertDifferential` is the one property body, shared rather than declared
 * twice: `test/integration/aggregate-commit-differential.test.ts` calls it
 * against PostgreSQL and `test/integration/sqlite-aggregate-commit-differential.test.ts`
 * calls it against SQLite (named for `vitest.sqlite.config.ts`'s `sqlite-*`
 * inclusion, the way `sqlite-space-repository.test.ts` and
 * `sqlite-hyper-cli.test.ts` already are), so a change to the property itself
 * cannot drift between the two databases it runs against.
 */

const scenarios = [
  'topology-preserving-update',
  'create-ordinary-space',
  'create-conflict',
  'update-conflict',
  'delete-conflict',
  'partial-deletion',
  'complete-deletion',
  'incomplete-deletion-proposal',
  'duplicate-space-change',
  'mismatched-snapshot',
] as const;

type Scenario = (typeof scenarios)[number];

interface GeneratedCase {
  readonly seed: number;
  readonly scenario: Scenario;
  readonly parentCount: number;
  readonly referencesPerParent: number;
  readonly extraSpaceCount: number;
  readonly staleRevision: number;
  readonly reverseChanges: boolean;
}

const generatedCase = fc.record({
  seed: fc.integer({ min: 1, max: 1_000_000 }),
  scenario: fc.constantFrom(...scenarios),
  parentCount: fc.integer({ min: 2, max: 4 }),
  referencesPerParent: fc.integer({ min: 1, max: 3 }),
  extraSpaceCount: fc.integer({ min: 0, max: 3 }),
  staleRevision: fc.integer({ min: 1, max: 20 }),
  reverseChanges: fc.boolean(),
});

const idAt = (seed: number, offset: number): UUID =>
  uuidSchema.parse(
    `00000000-0000-4000-8000-${(seed * 256 + offset).toString(16).padStart(12, '0')}`,
  );

/**
 * The Map and the Graph a generated Space owns, keyed off the offset its own
 * id came from.
 *
 * A Space Resource names a Map of its target and a Graph that Map owns
 * (ADR 0079), so a generated aggregate has to mint both alongside every Space it
 * mints. Deriving them from the target's offset is what lets a Space Resource built
 * anywhere in this fixture select a pair that genuinely resolves, without
 * threading the target's snapshot to the site that points at it.
 */
const mapIdAt = (seed: number, offset: number): UUID => idAt(seed, 100 + offset);
const graphIdAt = (seed: number, offset: number): UUID => idAt(seed, 150 + offset);

/**
 * A generated Space's document: one positioned Map owning one Graph.
 *
 * The Map positions nothing on purpose. Several scenarios below replace a
 * Space's Resources wholesale, and a Map that placed the Resources it started with
 * would fail intake for a reason the scenario is not about.
 */
const spaceDocument = (seed: number, offset: number, title: string) => ({
  version: 1 as const,
  title,
  defaultMap: mapIdAt(seed, offset),
  maps: [
    {
      id: mapIdAt(seed, offset),
      title: 'Map 1',
      kind: 'positioned' as const,
      positions: {},
      graphs: [{ id: graphIdAt(seed, offset), title: 'Graph 1', edges: [] }],
      activeGraph: graphIdAt(seed, offset),
    },
  ],
});

/** A Space Resource selecting the one Map and Graph the Space at `offset` owns. */
const spaceResource = (id: UUID, title: string, spaceId: UUID, seed: number, offset: number) => ({
  id,
  document: {
    title,
    kind: 'space' as const,
    spaceId,
    map: mapIdAt(seed, offset),
    graph: graphIdAt(seed, offset),
  },
});

interface Fixture {
  readonly metaSpaceId: UUID;
  readonly snapshots: readonly SpaceSnapshot[];
  readonly commit: SpaceCommit;
}

const orderedChanges = (
  first: SpaceChange,
  rest: readonly SpaceChange[],
  reverse: boolean,
): SpaceCommit['changes'] => {
  if (!reverse) return [first, ...rest];
  const [last, ...preceding] = [...rest].reverse();
  return last === undefined ? [first] : [last, ...preceding, first];
};

const fixtureFor = ({
  seed,
  scenario,
  parentCount,
  referencesPerParent,
  extraSpaceCount,
  staleRevision,
  reverseChanges,
}: GeneratedCase): Fixture => {
  const metaSpaceId = idAt(seed, 0);
  const parentSpaceIds = Array.from({ length: parentCount }, (_, index) => idAt(seed, 1 + index));
  const sharedSpaceId = idAt(seed, 10);
  const extraSpaceIds = Array.from({ length: extraSpaceCount }, (_, index) =>
    idAt(seed, 11 + index),
  );
  const newSpaceId = idAt(seed, 15);
  const newSpaceResourceId = idAt(seed, 240);

  const meta: SpaceSnapshot = {
    id: metaSpaceId,
    document: spaceDocument(seed, 0, `Meta ${seed}`),
    resources: [
      ...parentSpaceIds.map((spaceId, index) =>
        spaceResource(idAt(seed, 20 + index), `Parent ${index}`, spaceId, seed, 1 + index),
      ),
      ...extraSpaceIds.map((spaceId, index) =>
        spaceResource(idAt(seed, 30 + index), `Extra ${index}`, spaceId, seed, 11 + index),
      ),
    ],
  };
  const parents: SpaceSnapshot[] = parentSpaceIds.map((id, parentIndex) => ({
    id,
    document: spaceDocument(seed, 1 + parentIndex, `Parent ${parentIndex} seed ${seed}`),
    resources: Array.from({ length: referencesPerParent }, (_, referenceIndex) =>
      spaceResource(
        idAt(seed, 40 + parentIndex * 10 + referenceIndex),
        `Shared ${referenceIndex}`,
        sharedSpaceId,
        seed,
        10,
      ),
    ),
  }));
  const firstParent = parents[0];
  const selectedParent = parents[seed % parents.length];
  if (firstParent === undefined || selectedParent === undefined) {
    throw new Error('Generated aggregate requires at least two parent Spaces');
  }
  const shared: SpaceSnapshot = {
    id: sharedSpaceId,
    document: spaceDocument(seed, 10, `Shared ${seed}`),
    resources: [],
  };
  const extras: SpaceSnapshot[] = extraSpaceIds.map((id, index) => ({
    id,
    document: spaceDocument(seed, 11 + index, `Extra ${index} seed ${seed}`),
    resources: [],
  }));
  const snapshots = [meta, ...parents, shared, ...extras];
  const update = (snapshot: SpaceSnapshot) => ({
    kind: 'update' as const,
    spaceId: snapshot.id,
    snapshot,
    expectedRevision: 0n,
  });

  let commit: SpaceCommit;
  switch (scenario) {
    case 'topology-preserving-update':
      commit = {
        changes: [
          update({
            ...selectedParent,
            document: {
              ...selectedParent.document,
              title: `Renamed ${seed}`,
            },
          }),
        ],
      };
      break;
    case 'create-ordinary-space': {
      const created: SpaceSnapshot = {
        id: newSpaceId,
        document: spaceDocument(seed, 15, `Created ${seed}`),
        resources: [],
      };
      commit = {
        changes: orderedChanges(
          update({
            ...meta,
            resources: [
              ...meta.resources,
              spaceResource(newSpaceResourceId, 'Created', newSpaceId, seed, 15),
            ],
          }),
          [{ kind: 'create', spaceId: newSpaceId, snapshot: created }],
          reverseChanges,
        ),
      };
      break;
    }
    case 'create-conflict':
      commit = { changes: [{ kind: 'create', spaceId: sharedSpaceId, snapshot: shared }] };
      break;
    case 'update-conflict':
      commit = {
        changes: [{ ...update(meta), expectedRevision: BigInt(staleRevision) }],
      };
      break;
    case 'delete-conflict':
      commit = {
        changes: [
          { kind: 'delete', spaceId: sharedSpaceId, expectedRevision: BigInt(staleRevision) },
        ],
      };
      break;
    case 'partial-deletion':
      commit = {
        changes: [{ kind: 'delete', spaceId: sharedSpaceId, expectedRevision: 0n }],
      };
      break;
    case 'complete-deletion':
      commit = {
        changes: orderedChanges(
          update({ ...firstParent, resources: [] }),
          [
            ...parents.slice(1).map((parent) => update({ ...parent, resources: [] })),
            { kind: 'delete', spaceId: sharedSpaceId, expectedRevision: 0n },
          ],
          reverseChanges,
        ),
      };
      break;
    case 'incomplete-deletion-proposal':
      commit = {
        changes: orderedChanges(
          update({
            ...firstParent,
            document: { ...firstParent.document, title: `Still linked ${seed}` },
          }),
          [
            ...parents.slice(1).map((parent) => update({ ...parent, resources: [] })),
            { kind: 'delete', spaceId: sharedSpaceId, expectedRevision: 0n },
          ],
          reverseChanges,
        ),
      };
      break;
    case 'duplicate-space-change':
      commit = {
        changes: [update(meta), { kind: 'delete', spaceId: metaSpaceId, expectedRevision: 0n }],
      };
      break;
    case 'mismatched-snapshot':
      commit = {
        changes: [
          { kind: 'update', spaceId: metaSpaceId, snapshot: firstParent, expectedRevision: 0n },
        ],
      };
      break;
  }
  return { metaSpaceId, snapshots, commit };
};

const comparableResult = (
  result: CommitResult | RepositoryCommitResult,
): CommitResult | RepositoryCommitResult =>
  result.kind === 'permanent-failure' && result.code === 'invalid-commit'
    ? { kind: 'rejected', code: result.code, message: result.message }
    : result;

const comparableAggregate = ({ metaSpaceId, spaces }: LoadedAggregate): LoadedAggregate => ({
  metaSpaceId,
  spaces: [...spaces].sort((left, right) => left.snapshot.id.localeCompare(right.snapshot.id)),
});

/**
 * Both sides' answers put in one comparable shape.
 *
 * `loadAggregate` answers a *result*, and whether the repository is initialized
 * at all is part of what the two sides have to agree on — so the
 * normalisation has to run over the result rather than over an aggregate the
 * caller has already assumed. Comparing a raw result against a bare aggregate,
 * as this did, could only ever be false.
 */
const comparableAggregateResult = (result: AggregateLoadResult): AggregateLoadResult =>
  result.kind === 'loaded'
    ? { kind: 'loaded', aggregate: comparableAggregate(result.aggregate) }
    : result;

/**
 * Runs the whole generated differential against one target repository,
 * already opened and cleared between runs by `clear`. One property body
 * shared by both databases' test files (above) rather than duplicated per
 * target, so a change to the property itself cannot drift between them.
 */
export const assertDifferential = (target: {
  repository: SpaceRepository;
  clear: () => Promise<void>;
}) =>
  fc.assert(
    fc.asyncProperty(generatedCase, async (generated) => {
      const fixture = fixtureFor(generated);
      const initial = fixture.snapshots.map((snapshot) => ({
        snapshot,
        revision: 0n,
        exportedRevision: null,
      }));
      const memory = new MemorySpaceBackend(fixture.metaSpaceId, initial);

      await target.clear();
      // Both sides are told which Space is Meta, by the same value. The memory
      // backend always was — it takes `metaSpaceId` in its constructor — while
      // the SQL repository used to be seeded through `importSpaces(…, 'insert')`,
      // which read Meta off the first element of the array. So the two agreed
      // only while `fixture.snapshots[0]` stayed the Meta Space, and reordering
      // the generator's output would have made the differential compare two
      // differently-rooted aggregates and blame the repository. ADR 0078
      // retired that inference along with the mode parameter;
      // `initializeAggregate` names Meta outright, and the coupling is gone
      // rather than merely unexercised.
      const initialized = await target.repository.initializeAggregate({
        metaSpaceId: fixture.metaSpaceId,
        spaces: fixture.snapshots,
      });
      expect(initialized.kind).toBe('initialized');

      const [memoryResult, targetResult] = await Promise.all([
        memory.commit(fixture.commit),
        target.repository.commit(fixture.commit),
      ]);

      expect(comparableResult(targetResult)).toEqual(comparableResult(memoryResult));
      await expect(
        target.repository.loadAggregate().then(comparableAggregateResult),
      ).resolves.toEqual(comparableAggregateResult(await memory.loadAggregate()));
    }),
    {
      numRuns: 50,
      examples: scenarios.map((scenario, index) => [
        {
          seed: index + 1,
          scenario,
          parentCount: 2 + (index % 3),
          referencesPerParent: 1 + (index % 3),
          extraSpaceCount: index % 4,
          staleRevision: index + 1,
          reverseChanges: index % 2 === 0,
        },
      ]),
    },
  );
