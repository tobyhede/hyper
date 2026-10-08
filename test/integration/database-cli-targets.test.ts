import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { newUuid, uuidSchema } from '@project/core';
import type { DatabaseTarget, OpenedDatabaseTarget } from '../../src/database/database-target';
import { AGGREGATE_FILE_NAME } from '../../src/aggregate-directory';
import { runHyper } from '../../src/cli/run';
import { SqlSpaceRepository } from '../../src/persistence/sql-space-repository';
import { postgresSqlStore } from '../../src/prisma/sql-store';
import { sqliteSqlStore } from '../../src/sqlite/sql-store';
import { clearHyperContent } from '../support/clear-hyper-content';
import { openSqliteRepository } from '../support/sqlite-harness';
import { postgresTestDatabase } from '../support/postgres-database';
import { writeAggregateInto } from '../support/aggregate-directory';

const META_SPACE_ID = uuidSchema.parse('f1111111-1111-4111-8111-111111111111');
const RESOURCE_ID = uuidSchema.parse('f2222222-2222-4222-8222-222222222222');

interface CliTargetCase {
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

const targetCases = (all: readonly CliTargetCase[]): readonly CliTargetCase[] => {
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

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

const temporaryDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'hyper-cli-target-'));
  temporaryDirectories.push(directory);
  return directory;
};

const unreachedTarget: DatabaseTarget = {
  open: () => Promise.reject(new Error('The store --store did not name was opened')),
};

/** The author verbs' dependencies, which a database verb never reaches. */
const unlaunched = {
  workingDirectory: '/database-cli-targets/unreached',
  launchRun: () => Promise.reject(new Error('A run was launched')),
};

describe.each(cases)('database CLI target ($name)', (targetCase) => {
  it('imports and exports the same aggregate through the store --store names', async () => {
    const opened = await targetCase.arrange();
    let closeCount = 0;
    const target: DatabaseTarget = {
      open: () =>
        Promise.resolve({
          repository: opened.repository,
          close: () => {
            closeCount += 1;
            return Promise.resolve();
          },
        }),
    };
    const targets =
      targetCase.target === 'postgres'
        ? { postgres: target, sqlite: unreachedTarget }
        : { sqlite: target, postgres: unreachedTarget };
    const stdout = vi.fn();
    const stderr = vi.fn();
    const source = await writeAggregateInto(await temporaryDirectory(), META_SPACE_ID, [
      {
        name: META_SPACE_ID,
        spaceFile: JSON.stringify({ version: 1, id: META_SPACE_ID, title: 'Meta' }),
        resources: {
          [`${RESOURCE_ID}.md`]: `---\nid: ${RESOURCE_ID}\ntitle: Opening\nkind: markdown\n---\n\nHello.\n`,
        },
      },
    ]);
    const destination = join(await temporaryDirectory(), 'exported');
    try {
      await expect(
        runHyper(['import', source, '--store', targetCase.target], {
          io: { stdout, stderr },
          newId: newUuid,
          targets,
          ...unlaunched,
        }),
      ).resolves.toBe(0);
      expect(stderr).not.toHaveBeenCalled();
      expect(stdout).toHaveBeenCalledWith(`Imported space ${META_SPACE_ID} at revision 0\n`);

      await expect(
        runHyper(['export', destination, '--store', targetCase.target], {
          io: { stdout, stderr },
          newId: newUuid,
          targets,
          ...unlaunched,
        }),
      ).resolves.toBe(0);
      expect(stderr).not.toHaveBeenCalled();
      await expect(readFile(join(destination, AGGREGATE_FILE_NAME), 'utf8')).resolves.toBe(
        `${JSON.stringify({ version: 1, metaSpaceId: META_SPACE_ID }, null, 2)}\n`,
      );
      await expect(
        readFile(join(destination, META_SPACE_ID, 'resources', `${RESOURCE_ID}.md`), 'utf8'),
      ).resolves.toBe(`---\nid: ${RESOURCE_ID}\ntitle: Opening\nkind: markdown\n---\n\nHello.\n`);
      await expect(opened.repository.loadSpace(META_SPACE_ID)).resolves.toMatchObject({
        revision: 0n,
        exportedRevision: 0n,
      });
      expect(closeCount).toBe(2);
    } finally {
      await opened.close();
    }
  });
});
