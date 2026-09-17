import { isAbsolute } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { newUuid } from '@project/core';
import { SqliteSpaceRepository } from '../persistence/sqlite-space-repository';
import { configuredSqlitePath, createSqliteDatabase, type SqliteDatabase } from '../sqlite/db';
import { establishMetaSpace, retryMetaSpaceEstablishment } from '../startup/database-startup';
import { createSpaceHost, type SpaceHostApplication } from './space-host';

const reportEstablishmentFailure = (cause: unknown): void => {
  console.error('Failed to establish the Meta Space at startup', cause);
};

/** Report, and let a reporter that fails be the end of the reporting rather than of the host. */
const reportSafely = (report: (cause: unknown) => void, cause: unknown): void => {
  try {
    report(cause);
  } catch {
    // There is nowhere left to report the failure of a reporter.
  }
};

/**
 * The file `SQLITE_PATH` names, opened once at composition.
 *
 * Required rather than defaulted, as `pnpm hyper:sqlite` requires it
 * (`test/integration/sqlite-hyper-cli.test.ts`): a client with no file behind
 * it would compose, then fail every query, leaving a host that starts and
 * answers every request with an error. Ticket 15 puts setup failures at composition
 * (`test/integration/sqlite-http-runtime.test.ts`).
 *
 * Absolute, too: `pnpm dev:sqlite` migrates from the repository root and runs
 * this host from `packages/app`, so a relative path would migrate one file and
 * serve another.
 */
const openConfiguredDatabase = (): SqliteDatabase => {
  const path = configuredSqlitePath();
  if (path === undefined) throw new Error('SQLITE_PATH must name the SQLite database file');
  if (!isAbsolute(path)) throw new Error(`SQLITE_PATH must be an absolute path: ${path}`);
  return createSqliteDatabase(path);
};

/**
 * What this runtime can be handed instead of the ambient timer, stderr, and
 * hosted SQLite client (ADR 0016, ADR 0081).
 *
 * Tests pass an already-constructed client so they do not open a second runtime
 * against the live file this process already holds
 * (`test/integration/sqlite-http-runtime.test.ts`).
 */
export interface SqliteHttpRuntimeOptions {
  wait?: (milliseconds: number) => Promise<void>;
  report?: (cause: unknown) => void;
  database?: SqliteDatabase;
}

/**
 * Compose the opt-in SQLite runtime before exposing browser-safe HTTP
 * resources. PostgreSQL remains the default host; this module is loaded only by
 * the SQLite Vite entry.
 */
export const createApp = async ({
  wait = (milliseconds) => sleep(milliseconds, undefined, { ref: false }),
  report = reportEstablishmentFailure,
  database = openConfiguredDatabase(),
}: SqliteHttpRuntimeOptions = {}): Promise<SpaceHostApplication> => {
  const repository = new SqliteSpaceRepository(database);
  try {
    await establishMetaSpace(repository, newUuid);
  } catch (error) {
    reportSafely(report, error);
    void retryMetaSpaceEstablishment(repository, newUuid, { wait, report })
      .then((metaSpaceId) => {
        if (metaSpaceId !== undefined) return;
        reportSafely(
          report,
          new Error('Gave up establishing the Meta Space; restart the host once it is fixable'),
        );
      })
      .catch(() => undefined);
  }
  return createSpaceHost(repository, newUuid);
};
