import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from '@prisma-next/postgres/runtime';
import type { Contract } from './contract.d';
import contractJson from './contract.json' with { type: 'json' };

const moduleDirectory = dirname(fileURLToPath(import.meta.url));

/**
 * The nearest `.env` at or above `from`, or `undefined` when no directory on
 * the way to the filesystem root holds one.
 *
 * A fixed offset from this module cannot name one file for both of the places
 * this module runs from. Under `tsx` it is `src/prisma/db.ts`, where the
 * repository root is `../../`. `packages/app/http-server-build.config.ts` also
 * bundles it into `packages/app/dist-http/postgres-http-runtime.js`, which
 * `packages/app/database-vite-config.ts` names as `previewModule` and
 * `packages/app/vite-space-http-plugin.ts` imports by path — and there the same
 * `../../` is `packages/`, which holds no `.env`. So the search walks rather
 * than counts, which is one expression that is true of both and survives the
 * bundle moving again.
 *
 * `undefined` is not a failure: the driver's own default answers for an absent
 * `.env`, exactly as it does for an absent `DATABASE_URL`.
 */
export const repositoryEnvPath = (from: string = moduleDirectory): string | undefined => {
  let directory = from;
  while (!existsSync(join(directory, '.env'))) {
    const parent = dirname(directory);
    if (parent === directory) return undefined;
    directory = parent;
  }
  return join(directory, '.env');
};

/**
 * `DATABASE_URL` as `createPostgresDatabase` reads it: the nearest `.env`
 * loaded first (never overriding a variable already set), surrounding space
 * trimmed, and a blank value answered as absent.
 */
export const configuredDatabaseUrl = (): string | undefined => {
  const envPath = repositoryEnvPath();
  if (envPath !== undefined) loadEnv({ path: envPath, quiet: true });
  const databaseUrl = process.env['DATABASE_URL']?.trim();
  return databaseUrl === '' ? undefined : databaseUrl;
};

/**
 * The options `createPostgresDatabase` passes to `postgres<Contract>` — factored
 * out so a caller that needs the same runtime against a URL of its own (a test
 * pointed at a stand-in server, for instance) builds it the way production does
 * rather than restating `verifyMarker: false` and why.
 *
 * `verifyMarker: false` turns off `@prisma-next/sql-runtime`'s contract-marker
 * check. In the installed 0.16.0 the check never refuses anything — a missing
 * or mismatched marker only logs `CONTRACT.MARKER_MISSING` /
 * `CONTRACT.MARKER_MISMATCH` — and a failed read is memoised for the life of
 * the runtime: left on, a runtime whose first statement meets an unreachable
 * database answers every later read with that same cached failure, without
 * touching the network, until the process restarts (ticket 37). Held by
 * `test/unit/postgres-unreachable.test.ts`'s "SqlSpaceRepository (PostgreSQL)
 * after a first read meets an outage" — built with this function, a second
 * read against a server that reset the first connection opens a new one
 * rather than repeating the first failure.
 */
export const postgresOptionsFor = (
  databaseUrl: string | undefined,
): Parameters<typeof postgres<Contract>>[0] =>
  databaseUrl
    ? { contractJson, url: databaseUrl, verifyMarker: false }
    : { contractJson, verifyMarker: false };

export const createPostgresDatabase = () =>
  postgres<Contract>(postgresOptionsFor(configuredDatabaseUrl()));

export type PostgresDatabase = ReturnType<typeof createPostgresDatabase>;
