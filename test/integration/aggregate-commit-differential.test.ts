import fc from 'fast-check';
import { uuidSchema, type SpaceSnapshot, type UUID } from '@project/core';
import {
  MemorySpaceBackend,
  type CommitResult,
  type LoadedAggregate,
  type RepositoryCommitResult,
  type SpaceChange,
  type SpaceCommit,
} from '@project/persistence';
import { afterAll, describe, expect, it } from 'vitest';
import { PostgresSpaceRepository } from '../../src/persistence/postgres-space-repository';
import { db } from '../../src/prisma/db';
import { clearHyperContent } from '../support/clear-hyper-content';

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

const spaceCard = (id: UUID, title: string, spaceId: UUID) => ({
  id,
  document: { title, kind: 'space' as const, spaceId },
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
  const newSpaceCardId = idAt(seed, 240);

  const meta: SpaceSnapshot = {
    id: metaSpaceId,
    document: { version: 1, title: `Meta ${seed}` },
    cards: [
      ...parentSpaceIds.map((spaceId, index) =>
        spaceCard(idAt(seed, 20 + index), `Parent ${index}`, spaceId),
      ),
      ...extraSpaceIds.map((spaceId, index) =>
        spaceCard(idAt(seed, 30 + index), `Extra ${index}`, spaceId),
      ),
    ],
  };
  const parents: SpaceSnapshot[] = parentSpaceIds.map((id, parentIndex) => ({
    id,
    document: { version: 1, title: `Parent ${parentIndex} seed ${seed}` },
    cards: Array.from({ length: referencesPerParent }, (_, referenceIndex) =>
      spaceCard(
        idAt(seed, 40 + parentIndex * 10 + referenceIndex),
        `Shared ${referenceIndex}`,
        sharedSpaceId,
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
    document: { version: 1, title: `Shared ${seed}` },
    cards: [],
  };
  const extras: SpaceSnapshot[] = extraSpaceIds.map((id, index) => ({
    id,
    document: { version: 1, title: `Extra ${index} seed ${seed}` },
    cards: [],
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
        document: { version: 1, title: `Created ${seed}` },
        cards: [],
      };
      commit = {
        changes: orderedChanges(
          update({
            ...meta,
            cards: [...meta.cards, spaceCard(newSpaceCardId, 'Created', newSpaceId)],
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
          update({ ...firstParent, cards: [] }),
          [
            ...parents.slice(1).map((parent) => update({ ...parent, cards: [] })),
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
            ...parents.slice(1).map((parent) => update({ ...parent, cards: [] })),
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

describe('aggregate commit adapter differential', () => {
  it('gives memory and PostgreSQL the same public outcome over generated aggregate changes', async () => {
    await fc.assert(
      fc.asyncProperty(generatedCase, async (generated) => {
        const fixture = fixtureFor(generated);
        const initial = fixture.snapshots.map((snapshot) => ({
          snapshot,
          revision: 0n,
          exportedRevision: null,
        }));
        const memory = new MemorySpaceBackend(fixture.metaSpaceId, initial);
        const postgres = new PostgresSpaceRepository(db);

        await clearHyperContent();
        const imported = await postgres.importSpaces(fixture.snapshots, 'insert');
        expect(imported.kind).toBe('imported');

        const [memoryResult, postgresResult] = await Promise.all([
          memory.commit(fixture.commit),
          postgres.commit(fixture.commit),
        ]);

        expect(comparableResult(postgresResult)).toEqual(comparableResult(memoryResult));
        await expect(postgres.loadAggregate()).resolves.toEqual(
          comparableAggregate(await memory.loadAggregate()),
        );
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
  });

  afterAll(async () => {
    await clearHyperContent();
    await db.close();
  });
});
