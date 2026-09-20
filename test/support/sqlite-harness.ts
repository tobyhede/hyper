import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSqliteDatabase } from '../../src/sqlite/db';
import { SqlSpaceRepository } from '../../src/persistence/sql-space-repository';
import { sqliteSqlStore } from '../../src/sqlite/sql-store';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));

export const migrateSqliteFile = (path: string): void => {
  const command = spawnSync(
    'pnpm',
    ['exec', 'prisma-next', 'migrate', '--config', 'prisma-next.config.sqlite.ts'],
    {
      cwd: repositoryRoot,
      encoding: 'utf8',
      env: { ...process.env, SQLITE_PATH: path },
      timeout: 30_000,
    },
  );
  if (command.status !== 0) {
    throw new Error(
      `SQLite migrate failed\nstatus: ${command.status ?? 'not launched'}\nsignal: ${command.signal ?? 'none'}\nerror: ${command.error?.message ?? 'none'}\nstdout: ${command.stdout || '<empty>'}\nstderr: ${command.stderr || '<empty>'}`,
      { cause: command.error },
    );
  }
};

export const openSqliteRepository = async () => {
  const directory = await mkdtemp(join(tmpdir(), 'hyper-sqlite-'));
  const path = join(directory, 'hyper.db');
  migrateSqliteFile(path);
  const database = createSqliteDatabase(path);
  return {
    path,
    database,
    repository: new SqlSpaceRepository(sqliteSqlStore(database)),
    close: async () => {
      try {
        await database.close();
      } catch {
        // Already closed by a close/reopen case that constructed a successor.
      }
      await rm(directory, { recursive: true, force: true });
    },
  };
};
