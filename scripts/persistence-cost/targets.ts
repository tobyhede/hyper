import { copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import postgres from '@prisma-next/postgres/runtime';
import sqlite from '@prisma-next/sqlite/runtime';
import type { SpaceRepository } from '../../src/persistence/space-repository';
import { SqlSpaceRepository } from '../../src/persistence/sql-space-repository';
import type { Contract as PostgresContract } from '../../src/prisma/contract.d';
import { postgresOptionsFor } from '../../src/prisma/db';
import { postgresSqlStore } from '../../src/prisma/sql-store';
import type { Contract as SqliteContract } from '../../src/sqlite/contract.d';
import sqliteContractJson from '../../src/sqlite/contract.json' with { type: 'json' };
import { sqliteSqlStore } from '../../src/sqlite/sql-store';
import { clearSqlContent } from '../../test/support/clear-sql-content';
import { MemorySpaceRepository } from '../../test/support/memory-space-repository';
import { migrateSqliteFile } from '../../test/support/sqlite-harness';

/*
 * The repositories the persistence cost harness drives (ticket 17), each built
 * the way its production entry builds it plus one statement-recording
 * middleware. The SQL repository itself is never wrapped or altered.
 */

export type TargetName = 'postgres' | 'sqlite' | 'memory';

/** Which aggregate-lock mode a statement asked PostgreSQL for, if any. */
export type LockMode = 'shared' | 'exclusive';

export interface StatementRecord {
  readonly verb: string;
  readonly table: string;
  readonly rows: number;
  readonly sql: string;
  readonly paramBytes: number;
  /** The runtime's own measurement of the statement, from dispatch to completion. */
  readonly ms: number;
  readonly lock: LockMode | undefined;
}

/** The statements a target has executed since the caller last emptied it. */
export type StatementSink = StatementRecord[];

// The first table a statement names, allowing for a schema-qualified and
// quoted name such as PostgreSQL's `"public"."spaces"`.
const statementTable = (sql: string): string =>
  /\b(?:from|into|update)\s+(?:"?\w+"?\.)?"?(\w+)"?/iu.exec(sql)?.[1] ?? 'none';

const lockOf = (sql: string): LockMode | undefined => {
  if (sql.includes('pg_advisory_xact_lock_shared(')) return 'shared';
  if (sql.includes('pg_advisory_xact_lock(')) return 'exclusive';
  return undefined;
};

const recordingMiddleware = (sink: StatementSink) => ({
  name: 'persistence-cost-statements',
  afterExecute: (
    plan: { readonly sql: string; readonly params: unknown },
    result: { readonly rowCount: number; readonly latencyMs: number },
  ): Promise<void> => {
    sink.push({
      verb: (/^\s*(\w+)/u.exec(plan.sql)?.[1] ?? '?').toLowerCase(),
      table: statementTable(plan.sql),
      rows: result.rowCount,
      paramBytes: Buffer.byteLength(JSON.stringify(plan.params)),
      sql: plan.sql,
      ms: result.latencyMs,
      lock: lockOf(plan.sql),
    });
    return Promise.resolve();
  },
});

export interface Target {
  readonly name: TargetName;
  readonly repository: SpaceRepository;
  readonly close: () => Promise<void>;
}

export interface PostgresTarget extends Target {
  /** Delete every stored row, so the next scenario seeds an empty database. */
  readonly clear: () => Promise<void>;
}

const migratedTemplates = new Map<string, string>();

/** The migrated SQLite file at `path`, through `src/sqlite/db.ts`'s options. */
export const sqliteFileTarget = (path: string, sink: StatementSink): Target => {
  const database = sqlite<SqliteContract>({
    contractJson: sqliteContractJson,
    path,
    verifyMarker: false,
    middleware: [recordingMiddleware(sink)],
  });
  return {
    name: 'sqlite',
    repository: new SqlSpaceRepository(sqliteSqlStore(database)),
    close: () => database.close(),
  };
};

/** A fresh migrated SQLite file, copied from one template per directory. */
export const sqliteTarget = async (
  directory: string,
  label: string,
  sink: StatementSink,
): Promise<Target> => {
  let template = migratedTemplates.get(directory);
  if (template === undefined) {
    template = join(directory, 'template.db');
    migrateSqliteFile(template);
    migratedTemplates.set(directory, template);
  }
  const path = join(directory, `${label}.db`);
  await copyFile(template, path);
  return sqliteFileTarget(path, sink);
};

/**
 * The migrated PostgreSQL database `databaseUrl` names, through
 * `src/prisma/db.ts`'s options plus the recording middleware. Each call opens
 * its own runtime and so its own connection pool.
 */
export const postgresTarget = (databaseUrl: string, sink: StatementSink): PostgresTarget => {
  const database = postgres<PostgresContract>({
    ...postgresOptionsFor(databaseUrl),
    middleware: [recordingMiddleware(sink)],
  });
  const orm = database.orm.public;
  return {
    name: 'postgres',
    repository: new SqlSpaceRepository(postgresSqlStore(database)),
    clear: () =>
      clearSqlContent({
        deleteMetaIdentity: async () => {
          await orm.RepositoryState.where({ singletonId: 1 }).delete();
        },
        listSpaceIds: async () => orm.Space.select('id').all(),
        deleteResources: async (spaceId) =>
          orm.Resource.where({ spaceId })
            .deleteCount()
            .then(() => undefined),
        deleteSpace: async (spaceId) =>
          orm.Space.where({ id: spaceId })
            .deleteCount()
            .then(() => undefined),
      }),
    close: () => database.close(),
  };
};

export const memoryTarget = (): Target => ({
  name: 'memory',
  repository: new MemorySpaceRepository(),
  close: () => Promise.resolve(),
});

/** `DATABASE_URL`, required once PostgreSQL is asked for. */
export const requiredDatabaseUrl = (): string => {
  const url = process.env['DATABASE_URL']?.trim();
  if (url === undefined || url === '') {
    throw new Error('The postgres target needs DATABASE_URL naming a migrated database');
  }
  return url;
};
