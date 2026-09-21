import { afterAll, describe, expect, it } from 'vitest';
import {
  AggregateInvariantError,
  decodeLoadedSpace,
  decodeSpaceSummaries,
  type SpaceCommit,
} from '@project/persistence';
import type { UUID } from '@project/core';
import { SqlSpaceRepository } from '../../src/persistence/sql-space-repository';
import { createDatabaseHttpApp } from '../../src/http/database-http-runtime';
import type { DatabaseTarget, OpenedDatabaseTarget } from '../../src/database/database-target';
import { postgresSqlStore } from '../../src/prisma/sql-store';
import { sqliteSqlStore } from '../../src/sqlite/sql-store';
import { clearHyperContent } from '../support/clear-hyper-content';
import { openSqliteRepository } from '../support/sqlite-harness';
import { postgresTestDatabase } from '../support/postgres-database';
import type { SpaceRepository } from '../../src/persistence/space-repository';

const repositoryWithAggregateReads = (
  repository: SpaceRepository,
  loadAggregate: SpaceRepository['loadAggregate'],
  initializeAggregate: SpaceRepository['initializeAggregate'] = (input) =>
    repository.initializeAggregate(input),
): SpaceRepository => ({
  listSpaces: () => repository.listSpaces(),
  loadSpace: (id: UUID) => repository.loadSpace(id),
  loadAggregate,
  commit: (request: SpaceCommit) => repository.commit(request),
  initializeAggregate,
  loadMetaSpaceId: () => repository.loadMetaSpaceId(),
  replaceAggregate: (input, expectedMetaSpaceId) =>
    repository.replaceAggregate(input, expectedMetaSpaceId),
  markExported: (id, revision) => repository.markExported(id, revision),
});

interface HttpTargetCase {
  readonly name: string;
  readonly target: 'postgres' | 'sqlite';
  arrange(): Promise<OpenedDatabaseTarget>;
}

/**
 * One arm per database target, and each runs in the CI job that owns its
 * database: `vitest.integration.config.ts` provides `postgres` against the
 * migrated `DATABASE_URL`, `vitest.sqlite.config.ts` provides `sqlite` against
 * the migrated `SQLITE_PATH`, and neither job has the other's database. An
 * unrecognised value throws here rather than leaving a file that silently
 * declares no test.
 */
const configuredTarget = process.env['HYPER_DATABASE_TARGET'];

const targetCases = (all: readonly HttpTargetCase[]): readonly HttpTargetCase[] => {
  const selected = all.filter((candidate) => candidate.target === configuredTarget);
  if (selected.length === 0) {
    throw new Error(
      `HYPER_DATABASE_TARGET names no database target: ${configuredTarget ?? '<unset>'}`,
    );
  }
  return selected;
};

const cases = targetCases([
  {
    name: 'PostgreSQL',
    target: 'postgres',
    async arrange() {
      await clearHyperContent();
      return {
        repository: new SqlSpaceRepository(postgresSqlStore(postgresTestDatabase)),
        close: clearHyperContent,
      };
    },
  },
  {
    name: 'SQLite',
    target: 'sqlite',
    async arrange() {
      const harness = await openSqliteRepository();
      return {
        repository: new SqlSpaceRepository(sqliteSqlStore(harness.database)),
        close: harness.close,
      };
    },
  },
]);

/**
 * The shared PostgreSQL handle is a pool, and an open pool keeps this worker's
 * event loop alive after the last case — the shape behind Vitest's "something
 * prevents the main process from exiting". Every sibling that imports it closes
 * it here; so does this file. Under the SQLite target the handle was never
 * queried, so this closes a client that holds no connection.
 */
afterAll(async () => {
  await postgresTestDatabase.close();
});

describe.each(cases)('database HTTP runtime ($name)', (targetCase) => {
  it('establishes Default Content and serves the collection and Meta Space', async () => {
    const opened = await targetCase.arrange();
    const target: DatabaseTarget = { open: () => Promise.resolve(opened) };
    try {
      const application = await createDatabaseHttpApp(target, {
        wait: () => new Promise<void>(() => undefined),
      });
      const response = await application.fetch(new Request('http://hyper.test/api/spaces'));
      expect(response.status).toBe(200);
      const summaries = decodeSpaceSummaries(
        // SAFETY: JSON.parse is the HTTP body boundary; decodeSpaceSummaries parses next.
        JSON.parse(await response.text()) as unknown,
      );
      expect(summaries).toEqual([expect.objectContaining({ title: 'New space' })]);
      const metaId = summaries[0]?.id;
      if (metaId === undefined) throw new Error('Expected a Space summary');
      const loaded = await application.fetch(new Request(`http://hyper.test/api/spaces/${metaId}`));
      expect(loaded.status).toBe(200);
      const body = decodeLoadedSpace(
        // SAFETY: JSON.parse is the HTTP body boundary; decodeLoadedSpace parses next.
        JSON.parse(await loaded.text()) as unknown,
      );
      expect(body).toMatchObject({
        revision: 0n,
        snapshot: { id: metaId, document: { title: 'New space' } },
      });
    } finally {
      await opened.close();
    }
  });

  it('recovers through the shared retry after a transient startup failure', async () => {
    const opened = await targetCase.arrange();
    const recovered = Promise.withResolvers<undefined>();
    let reads = 0;
    const repository = repositoryWithAggregateReads(
      opened.repository,
      async () => {
        reads += 1;
        if (reads === 1) throw new Error('temporarily unavailable');
        return opened.repository.loadAggregate();
      },
      async (input) => {
        const result = await opened.repository.initializeAggregate(input);
        recovered.resolve(undefined);
        return result;
      },
    );
    const reports: unknown[] = [];
    try {
      const application = await createDatabaseHttpApp(
        { open: () => Promise.resolve({ repository, close: () => opened.close() }) },
        {
          wait: () => Promise.resolve(),
          report: (cause) => {
            reports.push(cause);
          },
        },
      );
      await recovered.promise;

      const response = await application.fetch(new Request('http://hyper.test/api/spaces'));
      expect(response.status).toBe(200);
      expect(
        decodeSpaceSummaries(
          // SAFETY: JSON.parse is the HTTP boundary; decodeSpaceSummaries validates next.
          JSON.parse(await response.text()) as unknown,
        ),
      ).toEqual([expect.objectContaining({ title: 'New space' })]);
      expect(reports).toEqual([expect.objectContaining({ message: 'temporarily unavailable' })]);
    } finally {
      await opened.close();
    }
  });

  it('gives up through the shared retry after two confirmed invariant failures', async () => {
    const opened = await targetCase.arrange();
    const gaveUp = Promise.withResolvers<undefined>();
    const reports: unknown[] = [];
    const repository = repositoryWithAggregateReads(opened.repository, () =>
      Promise.reject(new AggregateInvariantError('broken stored aggregate')),
    );
    try {
      await createDatabaseHttpApp(
        { open: () => Promise.resolve({ repository, close: () => opened.close() }) },
        {
          wait: () => Promise.resolve(),
          report: (cause) => {
            reports.push(cause);
            if (cause instanceof Error && cause.message.startsWith('Gave up establishing')) {
              gaveUp.resolve(undefined);
            }
          },
        },
      );
      await gaveUp.promise;

      expect(reports).toHaveLength(4);
      expect(reports.slice(0, 3)).toEqual([
        expect.objectContaining({ message: 'broken stored aggregate' }),
        expect.objectContaining({ message: 'broken stored aggregate' }),
        expect.objectContaining({ message: 'broken stored aggregate' }),
      ]);
      const finalReport = reports[3];
      expect(finalReport).toBeInstanceOf(Error);
      if (!(finalReport instanceof Error)) throw new Error('Expected final give-up report');
      expect(finalReport.message).toMatch(/^Gave up establishing/);
    } finally {
      await opened.close();
    }
  });
});
