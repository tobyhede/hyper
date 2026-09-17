import { existsSync } from 'node:fs';
import { newUuid } from '@project/core';
import { runCliMain } from './main';
import { cliArguments, processIo } from './process';
import { SqliteSpaceRepository } from '../persistence/sqlite-space-repository';
import { configuredSqlitePath, createSqliteDatabase, type SqliteDatabase } from '../sqlite/db';

/**
 * `pnpm hyper:sqlite`: the same commands as `pnpm hyper`, against the SQLite
 * file `SQLITE_PATH` names.
 *
 * The target is chosen by which script runs, as `pnpm dev:sqlite` chooses the
 * host, so PostgreSQL stays the default and a `.env` naming both databases
 * cannot move the CLI between them. The path is required rather than
 * defaulted: an import into a database nobody named would land somewhere the
 * operator is not looking. The file must already be migrated
 * (`pnpm db:migrate:sqlite`), as PostgreSQL's must, and no running host may
 * have it open.
 */
const openDatabase = (): SqliteDatabase | undefined => {
  const path = configuredSqlitePath();
  if (path === undefined) {
    processIo.stderr('SQLITE_PATH must name the SQLite database file\n');
    return undefined;
  }
  try {
    // SQLite creates a missing file on first open, so a mistyped path would
    // leave an empty, unmigrated file behind and fail on a missing table.
    if (!existsSync(path)) {
      throw new Error(
        `SQLite database file does not exist: ${path}. Run pnpm db:migrate:sqlite first.`,
      );
    }
    return createSqliteDatabase(path);
  } catch (error) {
    processIo.stderr(
      `Database open failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return undefined;
  }
};

const database = openDatabase();

process.exitCode =
  database === undefined
    ? 1
    : await runCliMain(cliArguments(), {
        repository: new SqliteSpaceRepository(database),
        io: processIo,
        newId: newUuid,
        close: () => database.close(),
      });
