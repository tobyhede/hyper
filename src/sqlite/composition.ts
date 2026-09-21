import type { DatabaseTarget } from '../database/database-target';
import { sqliteCliPath, sqliteDevelopmentPath, sqliteHostPath, sqliteMigrationPath } from './db';
import { sqliteTarget } from './target';

export interface SqlitePathComposition {
  readonly path: string;
}

export interface SqliteMigrationComposition {
  readonly path: string | undefined;
}

export interface SqliteTargetComposition extends SqlitePathComposition {
  readonly target: DatabaseTarget;
}

const targetComposition = (resolvePath: () => string): SqliteTargetComposition => {
  let resolved: string | undefined;
  const path = (): string => {
    resolved ??= resolvePath();
    return resolved;
  };
  return {
    get path() {
      return path();
    },
    target: {
      open: () => sqliteTarget({ path: path() }).open(),
    },
  };
};

/** The path handed to Prisma Next migration, if online migration was requested. */
export const sqliteMigrationComposition = (envPath?: string): SqliteMigrationComposition => ({
  path: sqliteMigrationPath(envPath),
});

/** The target and path the SQLite HTTP host opens. */
export const sqliteHostComposition = (envPath?: string): SqliteTargetComposition =>
  targetComposition(() => sqliteHostPath(envPath));

/** The existing-file target and path the SQLite CLI opens. */
export const sqliteCliComposition = (envPath?: string): SqliteTargetComposition =>
  targetComposition(() => sqliteCliPath(envPath));

/** The one path development passes to both migration and the Vite host. */
export const sqliteDevelopmentComposition = (envPath?: string): SqlitePathComposition => ({
  path: sqliteDevelopmentPath(envPath),
});
