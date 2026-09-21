import { afterAll, describe, expect, it, vi } from 'vitest';
import { newUuid, uuidSchema } from '@project/core';
import type { DatabaseTarget, OpenedDatabaseTarget } from '../../src/database/database-target';
import { runDatabaseCli } from '../../src/cli/database-entry';
import { SqlSpaceRepository } from '../../src/persistence/sql-space-repository';
import { postgresSqlStore } from '../../src/prisma/sql-store';
import { sqliteSqlStore } from '../../src/sqlite/sql-store';
import { clearHyperContent } from '../support/clear-hyper-content';
import { openSqliteRepository } from '../support/sqlite-harness';
import { postgresTestDatabase } from '../support/postgres-database';

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

describe.each(cases)('database CLI target ($name)', (targetCase) => {
  it('initializes and reports the same complete Default Content aggregate', async () => {
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
    const stdout = vi.fn();
    const stderr = vi.fn();
    try {
      await expect(runDatabaseCli(target, [], { stdout, stderr }, newUuid)).resolves.toBe(0);
      expect(stderr).not.toHaveBeenCalled();
      expect(stdout).toHaveBeenCalledWith(
        expect.stringMatching(/^Opened space .+ at revision 0\n$/),
      );
      await expect(opened.repository.listSpaces()).resolves.toEqual([
        expect.objectContaining({ title: 'New space' }),
      ]);
      const catalog = await opened.repository.listSpaces();
      const created = catalog[0];
      if (created === undefined) throw new Error('Expected the new Space in the catalog');
      const stored = await opened.repository.loadSpace(created.id);
      const map = stored?.snapshot.document.maps?.[0];
      const graph = map?.graphs[0];
      const resourceId = stored?.snapshot.resources[0]?.id;
      if (map === undefined || graph === undefined || resourceId === undefined) {
        throw new Error('Expected a complete new Space');
      }
      expect(stored).toEqual({
        snapshot: {
          id: created.id,
          document: {
            version: 1,
            title: 'New space',
            maps: [
              {
                id: map.id,
                title: 'Map 1',
                kind: 'positioned',
                positions: { [resourceId]: { x: 0, y: 0, open: false } },
                graphs: [{ id: graph.id, title: 'Graph 1', edges: [] }],
                activeGraph: graph.id,
              },
            ],
            defaultMap: map.id,
          },
          resources: [
            {
              id: resourceId,
              document: { title: 'Resource 1', kind: 'markdown', body: '' },
            },
          ],
        },
        revision: 0n,
        exportedRevision: null,
      });
      for (const id of [resourceId, map.id, graph.id]) {
        expect(uuidSchema.safeParse(id).success).toBe(true);
      }

      stdout.mockClear();
      await expect(runDatabaseCli(target, [], { stdout, stderr }, newUuid)).resolves.toBe(0);
      expect(stdout).toHaveBeenCalledWith(`Opened space ${created.id} at revision 0\n`);
      await expect(opened.repository.listSpaces()).resolves.toEqual([created]);
      await expect(opened.repository.loadSpace(created.id)).resolves.toEqual(stored);
      expect(closeCount).toBe(2);
    } finally {
      await opened.close();
    }
  });
});
