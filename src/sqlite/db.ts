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

export const createSqliteDatabase = (path?: string) =>
  sqlite<Contract>(optionsFor(path === undefined ? undefined : requireWritableParent(path)));

export type SqliteDatabase = ReturnType<typeof createSqliteDatabase>;
