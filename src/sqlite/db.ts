import 'dotenv/config';
import { accessSync, constants } from 'node:fs';
import { dirname, resolve } from 'node:path';
import sqlite from '@prisma-next/sqlite/runtime';
import type { Contract } from './contract.d';
import contractJson from './contract.json' with { type: 'json' };

const optionsFor = (path: string | undefined): Parameters<typeof sqlite<Contract>>[0] =>
  path === undefined ? { contractJson } : { contractJson, path };

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
    throw new Error(`SQLite parent directory is missing or unwritable: ${parent}`);
  }
  return absolute;
};

/** The `SQLITE_PATH` a host or CLI was started with, when it names anything. */
export const configuredSqlitePath = (): string | undefined => {
  const configured = process.env['SQLITE_PATH']?.trim();
  return configured === undefined || configured === '' ? undefined : configured;
};

/**
 * `configuredSqlitePath`, or the one message a host and a CLI both report for
 * an unset `SQLITE_PATH`. The host lets the throw propagate at composition
 * (`src/http/sqlite-http-runtime.ts`); the CLI catches it and writes the same
 * message to stderr ahead of every other setup failure
 * (`src/cli/sqlite-entry.ts`).
 */
export const requireConfiguredSqlitePath = (): string => {
  const configured = configuredSqlitePath();
  if (configured === undefined) throw new Error('SQLITE_PATH must name the SQLite database file');
  return configured;
};

export const createSqliteDatabase = (path?: string) =>
  sqlite<Contract>(optionsFor(path === undefined ? undefined : requireWritableParent(path)));

export type SqliteDatabase = ReturnType<typeof createSqliteDatabase>;
