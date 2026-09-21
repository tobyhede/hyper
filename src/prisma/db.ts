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

export const createPostgresDatabase = () => {
  const databaseUrl = configuredDatabaseUrl();
  const options: Parameters<typeof postgres<Contract>>[0] = databaseUrl
    ? { contractJson, url: databaseUrl }
    : { contractJson };
  return postgres<Contract>(options);
};

export type PostgresDatabase = ReturnType<typeof createPostgresDatabase>;
