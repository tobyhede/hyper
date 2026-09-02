import fc from 'fast-check';
import { uuidSchema, type SpaceSnapshot, type UUID } from '@project/core';
import {
  MemorySpaceBackend,
  type CommitResult,
  type LoadedAggregate,
  type RepositoryCommitResult,
  type SpaceCommit,
} from '@project/persistence';
import { afterAll, describe, expect, it } from 'vitest';
import { PostgresSpaceRepository } from '../../src/persistence/postgres-space-repository';
import { db } from '../../src/prisma/db';

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

const idAt = (seed: number, offset: number): UUID =>
  uuidSchema.parse(
    `00000000-0000-4000-8000-${(seed * 32 + offset).toString(16).padStart(12, '0')}`,
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

const fixtureFor = (seed: number, scenario: Scenario): Fixture => {
  const metaSpaceId = idAt(seed, 0);
  const leftSpaceId = idAt(seed, 1);
  const rightSpaceId = idAt(seed, 2);
  const sharedSpaceId = idAt(seed, 3);
  const newSpaceId = idAt(seed, 4);
  const metaLeftCardId = idAt(seed, 5);
  const metaRightCardId = idAt(seed, 6);
  const leftSharedCardId = idAt(seed, 7);
  const rightSharedCardId = idAt(seed, 8);
  const newSpaceCardId = idAt(seed, 9);

  const meta: SpaceSnapshot = {
    id: metaSpaceId,
    document: { version: 1, title: `Meta ${seed}` },
    cards: [
      spaceCard(metaLeftCardId, 'Left', leftSpaceId),
      spaceCard(metaRightCardId, 'Right', rightSpaceId),
    ],
  };
  const left: SpaceSnapshot = {
    id: leftSpaceId,
    document: { version: 1, title: `Left ${seed}` },
    cards: [spaceCard(leftSharedCardId, 'Shared from left', sharedSpaceId)],
  };
  const right: SpaceSnapshot = {
    id: rightSpaceId,
    document: { version: 1, title: `Right ${seed}` },
    cards: [spaceCard(rightSharedCardId, 'Shared from right', sharedSpaceId)],
  };
  const shared: SpaceSnapshot = {
    id: sharedSpaceId,
    document: { version: 1, title: `Shared ${seed}` },
    cards: [],
  };
  const snapshots = [meta, left, right, shared] as const;
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
        changes: [update({ ...meta, document: { ...meta.document, title: `Renamed ${seed}` } })],
      };
      break;
    case 'create-ordinary-space': {
      const created: SpaceSnapshot = {
        id: newSpaceId,
        document: { version: 1, title: `Created ${seed}` },
        cards: [],
      };
      commit = {
        changes: [
          update({
            ...meta,
            cards: [...meta.cards, spaceCard(newSpaceCardId, 'Created', newSpaceId)],
          }),
          { kind: 'create', spaceId: newSpaceId, snapshot: created },
        ],
      };
      break;
    }
    case 'create-conflict':
      commit = { changes: [{ kind: 'create', spaceId: sharedSpaceId, snapshot: shared }] };
      break;
    case 'update-conflict':
      commit = {
        changes: [{ ...update(meta), expectedRevision: 1n }],
      };
      break;
    case 'delete-conflict':
      commit = {
        changes: [{ kind: 'delete', spaceId: sharedSpaceId, expectedRevision: 1n }],
      };
      break;
    case 'partial-deletion':
      commit = {
        changes: [{ kind: 'delete', spaceId: sharedSpaceId, expectedRevision: 0n }],
      };
      break;
    case 'complete-deletion':
      commit = {
        changes: [
          update({ ...left, cards: [] }),
          update({ ...right, cards: [] }),
          { kind: 'delete', spaceId: sharedSpaceId, expectedRevision: 0n },
        ],
      };
      break;
    case 'incomplete-deletion-proposal':
      commit = {
        changes: [
          update({ ...left, cards: [] }),
          update({ ...right, document: { ...right.document, title: `Still linked ${seed}` } }),
          { kind: 'delete', spaceId: sharedSpaceId, expectedRevision: 0n },
        ],
      };
      break;
    case 'duplicate-space-change':
      commit = {
        changes: [update(meta), { kind: 'delete', spaceId: metaSpaceId, expectedRevision: 0n }],
      };
      break;
    case 'mismatched-snapshot':
      commit = {
        changes: [{ kind: 'update', spaceId: metaSpaceId, snapshot: left, expectedRevision: 0n }],
      };
      break;
  }
  return { metaSpaceId, snapshots, commit };
};

const clearHyperContent = async (): Promise<void> => {
  await db.orm.public.RepositoryState.where({ singletonId: 1 }).delete();
  for (const space of await db.orm.public.Space.all()) {
    await db.orm.public.Card.where({ spaceId: space.id }).deleteAll();
    await db.orm.public.Space.where({ id: space.id }).delete();
  }
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
      fc.asyncProperty(
        fc.integer({ min: 1, max: 1_000_000 }),
        fc.constantFrom(...scenarios),
        async (seed, scenario) => {
          const fixture = fixtureFor(seed, scenario);
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
        },
      ),
      {
        numRuns: 30,
        examples: scenarios.map((scenario, index) => [index + 1, scenario]),
      },
    );
  });

  afterAll(async () => {
    await clearHyperContent();
    await db.close();
  });
});
