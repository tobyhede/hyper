import { parse as parseEnv } from 'dotenv';
import { accessSync, constants, existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sqlite from '@prisma-next/sqlite/runtime';
import type { Contract } from './contract.d';
import contractJson from './contract.json' with { type: 'json' };
import { DatabaseTargetConfigurationError } from '../database/database-target';

/*
 * `verifyMarker: false` disables the contract-marker check for the reason and
 * with the test coverage recorded on `postgresOptionsFor` (`src/prisma/db.ts`,
 * ticket 37) — `@prisma-next/sqlite`'s runtime extends the same
 * `@prisma-next/sql-runtime` `SqlRuntimeBase` and passes `verifyMarker`
 * straight through, so the same reasoning applies here.
 */
const optionsFor = (path: string | undefined): Parameters<typeof sqlite<Contract>>[0] =>
  path === undefined
    ? { contractJson, verifyMarker: false }
    : { contractJson, path, verifyMarker: false };

/**
 * Fail before the driver opens a connection the parent cannot support.
 *
 * SQLite will not create missing parents, and an unwritable directory surfaces
 * later as a driver error whose message is not ours. Ticket 15 asks for a
 * clear failure at composition
 * (`test/unit/prisma-sqlite-foundation.test.ts`).
 */
const requireWritableParent = (path: string): string => {
  const absolute = resolve(path);
  const parent = dirname(absolute);
  try {
    accessSync(parent, constants.W_OK);
  } catch {
    throw new DatabaseTargetConfigurationError(
      `SQLite parent directory is missing or unwritable: ${parent}`,
    );
  }
  return absolute;
};

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
export const SQLITE_ENV_PATH = fileURLToPath(new URL('../../.env', import.meta.url));
export const DEFAULT_SQLITE_PATH = resolve(repositoryRoot, '.scratch/sqlite/hyper.db');

export interface SqlitePathOptions {
  readonly defaultPath?: string;
  readonly envPath?: string;
  readonly required?: boolean;
  readonly existing?: boolean;
}

/**
 * The `SQLITE_PATH` a named environment file carries, read without writing to
 * `process.env`.
 *
 * `dotenv`'s `config` loads into the process and then declines to overwrite a
 * key the process already holds — including the one it wrote itself. So a
 * second composition naming a different file kept the first file's path, and
 * `envPath` meant nothing after the first call in a process. Reading the file
 * per call keeps dotenv's precedence — a variable already in the environment
 * still wins — without the process-wide memory.
 */
const environmentFilePath = (envPath: string): string | undefined => {
  let contents: string;
  try {
    contents = readFileSync(envPath, 'utf8');
  } catch {
    // No environment file to read: the process environment and the caller's
    // default are what is left.
    return undefined;
  }
  return parseEnv(contents)['SQLITE_PATH'];
};

/** Resolve SQLite configuration from the named repository-root environment. */
export const configuredSqlitePath = (options: SqlitePathOptions = {}): string | undefined => {
  const configured = (
    process.env['SQLITE_PATH'] ?? environmentFilePath(options.envPath ?? SQLITE_ENV_PATH)
  )?.trim();
  const selected = configured === undefined || configured === '' ? options.defaultPath : configured;
  if (selected === undefined) {
    if (options.required === true) {
      throw new DatabaseTargetConfigurationError('SQLITE_PATH must name the SQLite database file');
    }
    return undefined;
  }
  /*
   * `node:path`, not a leading-separator test: a drive-letter or UNC path is
   * absolute on Windows and `resolve` below already treats it as one.
   */
  if (!isAbsolute(selected))
    throw new DatabaseTargetConfigurationError(`SQLITE_PATH must be an absolute path: ${selected}`);
  const absolute = requireWritableParent(selected);
  if (options.existing === true && !existsSync(absolute)) {
    throw new Error(
      `SQLite database file does not exist: ${absolute}. Run pnpm db:migrate:sqlite first.`,
    );
  }
  return absolute;
};

/**
 * `configuredSqlitePath`, or the one message a host and a CLI both report for
 * an unset `SQLITE_PATH`. The host lets the throw propagate at composition
 * (`src/http/sqlite-http-runtime.ts`); the CLI catches it and writes the same
 * message to stderr ahead of every other setup failure
 * (`src/cli/sqlite-entry.ts`).
 */
export const requireConfiguredSqlitePath = (
  options: { readonly envPath?: string; readonly existing?: boolean } = {},
): string => {
  const configured =
    options.envPath === undefined
      ? configuredSqlitePath(
          options.existing === undefined
            ? { required: true }
            : { required: true, existing: options.existing },
        )
      : configuredSqlitePath(
          options.existing === undefined
            ? { required: true, envPath: options.envPath }
            : { required: true, envPath: options.envPath, existing: options.existing },
        );
  if (configured === undefined) throw new Error('SQLITE_PATH must name the SQLite database file');
  return configured;
};

export const sqliteMigrationPath = (envPath?: string): string | undefined =>
  configuredSqlitePath(envPath === undefined ? {} : { envPath });
export const sqliteHostPath = (envPath?: string): string =>
  requireConfiguredSqlitePath(envPath === undefined ? {} : { envPath });
export const sqliteCliPath = (envPath?: string): string =>
  requireConfiguredSqlitePath(
    envPath === undefined ? { existing: true } : { envPath, existing: true },
  );
export const sqliteDevelopmentPath = (envPath?: string): string => {
  const configured = configuredSqlitePath(
    envPath === undefined
      ? { defaultPath: DEFAULT_SQLITE_PATH }
      : { defaultPath: DEFAULT_SQLITE_PATH, envPath },
  );
  if (configured === undefined)
    throw new Error('The SQLite development path could not be resolved');
  return configured;
};

export const createSqliteDatabase = (path?: string) =>
  sqlite<Contract>(optionsFor(path === undefined ? undefined : requireWritableParent(path)));

export type SqliteDatabase = ReturnType<typeof createSqliteDatabase>;
