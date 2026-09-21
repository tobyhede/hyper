import { describe, expect, it, vi } from 'vitest';
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
  arrange(): Promise<OpenedDatabaseTarget>;
}

const cases: readonly CliTargetCase[] = [
  {
    name: 'PostgreSQL',
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
    async arrange() {
      const harness = await openSqliteRepository();
      return {
        repository: new SqlSpaceRepository(sqliteSqlStore(harness.database)),
        close: harness.close,
      };
    },
  },
];

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
