import { uuidSchema, type SpaceSnapshot } from '@project/core';
import type { RepositoryCommitResult } from '@project/persistence';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SqlSpaceRepository } from '../../src/persistence/sql-space-repository';
import type { SpaceRepository } from '../../src/persistence/space-repository';
import { createPostgresDatabase, type PostgresDatabase } from '../../src/prisma/db';
import { postgresSqlStore } from '../../src/prisma/sql-store';
import { clearHyperContent } from '../support/clear-hyper-content';
import { postgresTestDatabase as db } from '../support/postgres-database';

const firstMeta: SpaceSnapshot = {
  id: uuidSchema.parse('e3700000-0000-4000-8000-000000000001'),
  document: { version: 1, title: 'First proposal' },
  resources: [],
};
const secondMeta: SpaceSnapshot = {
  id: uuidSchema.parse('e3700000-0000-4000-8000-000000000002'),
  document: { version: 1, title: 'Second proposal' },
  resources: [],
};

describe('PostgreSQL aggregate operations before initialization', () => {
  const databases: PostgresDatabase[] = [];
  beforeEach(clearHyperContent);
  afterEach(async () => {
    await Promise.all(databases.map((database) => database.close()));
    databases.length = 0;
    await clearHyperContent();
  });
  afterAll(() => db.close());

  const openStore = () => {
    const database = createPostgresDatabase();
    databases.push(database);
    return postgresSqlStore(database);
  };

  const overlapping = async <Result>(
    boundary: 'meta-read' | 'spaces-read' | 'meta-delete',
    operation: (repository: SpaceRepository) => Promise<Result>,
    proposal: SpaceSnapshot = secondMeta,
    competingCommit?: (repository: SpaceRepository) => Promise<RepositoryCommitResult>,
  ) => {
    const paused = Promise.withResolvers<undefined>();
    const resume = Promise.withResolvers<undefined>();
    const store = openStore();
    let didPause = false;
    const pause = async () => {
      if (didPause) return;
      didPause = true;
      paused.resolve(undefined);
      await resume.promise;
    };
    const first = new SqlSpaceRepository({
      ...store,
      tables(handle) {
        const tables = store.tables(handle);
        return {
          ...tables,
          Space: {
            ...tables.Space,
            async loadEvery() {
              const rows = await tables.Space.loadEvery();
              if (boundary === 'spaces-read') await pause();
              return rows;
            },
          },
          RepositoryState: {
            ...tables.RepositoryState,
            async read() {
              const state = await tables.RepositoryState.read();
              if (boundary === 'meta-read') await pause();
              return state;
            },
            async delete() {
              await tables.RepositoryState.delete();
              if (boundary === 'meta-delete') await pause();
            },
          },
        };
      },
    });
    const second = new SqlSpaceRepository(openStore());
    const firstResult = operation(first);
    await paused.promise;
    const secondResult =
      competingCommit === undefined
        ? second.initializeAggregate({ metaSpaceId: proposal.id, spaces: [proposal] })
        : competingCommit(second);
    const results = Promise.all([firstResult, secondResult]);
    let settled = false;
    void secondResult.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    try {
      // Scheduling evidence only: let the second real connection either finish
      // (the race) or wait for the first transaction's lock (serialised).
      // No elapsed-time guess decides when the first transaction resumes.
      await expect
        .poll(async () => {
          const plan = db.sql.public.repository_state
            .select(() => ({
              waiting:
                db.raw`(count(*) >= 0) AND EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock')`.returns(
                  'pg/bool@1',
                ),
            }))
            .build();
          const rows = await db.runtime().execute(plan);
          return settled || rows.some((row) => row.waiting);
        })
        .toBe(true);
    } finally {
      resume.resolve(undefined);
    }
    return { results: await results, repository: second };
  };

  it('preserves the successful proposal when another initializer already read an empty aggregate', async () => {
    const { results, repository } = await overlapping('spaces-read', (repository) =>
      repository.initializeAggregate({ metaSpaceId: firstMeta.id, spaces: [firstMeta] }),
    );
    expect(results.map((result) => result.kind).sort()).toEqual([
      'already-initialized',
      'initialized',
    ]);
    const winner = results[0].kind === 'initialized' ? firstMeta : secondMeta;
    await expect(repository.loadAggregate()).resolves.toEqual({
      kind: 'loaded',
      aggregate: {
        metaSpaceId: winner.id,
        spaces: [{ snapshot: winner, revision: 0n, exportedRevision: null }],
      },
    });
  });

  it('does not replace a concurrent first aggregate using an absent expected Meta identity', async () => {
    const { results, repository } = await overlapping('meta-read', (repository) =>
      repository.replaceAggregate({ metaSpaceId: firstMeta.id, spaces: [firstMeta] }, undefined),
    );
    expect(results[0]).toEqual({ kind: 'uninitialized' });
    expect(results[1].kind).toBe('initialized');
    await expect(repository.loadAggregate()).resolves.toEqual({
      kind: 'loaded',
      aggregate: {
        metaSpaceId: secondMeta.id,
        spaces: [{ snapshot: secondMeta, revision: 0n, exportedRevision: null }],
      },
    });
  });

  it('reads a consistent uninitialized aggregate while another runtime initializes it', async () => {
    const { results, repository } = await overlapping('meta-read', (repository) =>
      repository.loadAggregate(),
    );
    expect(results[0]).toEqual({ kind: 'uninitialized' });
    expect(results[1].kind).toBe('initialized');
    await expect(repository.loadAggregate()).resolves.toMatchObject({
      kind: 'loaded',
      aggregate: { metaSpaceId: secondMeta.id },
    });
  });

  it('judges a complete-aggregate commit against the aggregate a concurrent initializer establishes', async () => {
    const { results, repository } = await overlapping(
      'spaces-read',
      (repository) =>
        repository.initializeAggregate({ metaSpaceId: secondMeta.id, spaces: [secondMeta] }),
      secondMeta,
      (repository) =>
        repository.commit({
          changes: [{ kind: 'create', spaceId: firstMeta.id, snapshot: firstMeta }],
        }),
    );
    expect(results[0].kind).toBe('initialized');
    expect(results[1]).toMatchObject({
      kind: 'aggregate-refused',
      errors: [{ kind: 'ordinary-space-unreferenced', spaceId: firstMeta.id }],
    });
    await expect(repository.loadAggregate()).resolves.toEqual({
      kind: 'loaded',
      aggregate: {
        metaSpaceId: secondMeta.id,
        spaces: [{ snapshot: secondMeta, revision: 0n, exportedRevision: null }],
      },
    });
  });

  it.each([
    { boundary: 'meta-read', proposal: secondMeta, expected: 'already-initialized' },
    { boundary: 'meta-read', proposal: firstMeta, expected: 'existing' },
    { boundary: 'meta-delete', proposal: secondMeta, expected: 'already-initialized' },
  ] as const)(
    'initializes without losing integrity after $boundary with $expected competing proposal',
    async ({ boundary, proposal, expected }) => {
      const { results, repository } = await overlapping(
        boundary,
        (repository) =>
          repository.initializeAggregate({ metaSpaceId: firstMeta.id, spaces: [firstMeta] }),
        proposal,
      );
      expect(results.map((result) => result.kind)).toEqual(['initialized', expected]);
      await expect(repository.loadAggregate()).resolves.toEqual({
        kind: 'loaded',
        aggregate: {
          metaSpaceId: firstMeta.id,
          spaces: [{ snapshot: firstMeta, revision: 0n, exportedRevision: null }],
        },
      });
    },
  );
});
