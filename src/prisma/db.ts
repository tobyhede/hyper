import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import postgres from '@prisma-next/postgres/runtime';
import type { Contract } from './contract.d';
import contractJson from './contract.json' with { type: 'json' };

const repositoryEnv = fileURLToPath(new URL('../../.env', import.meta.url));

export const createPostgresDatabase = () => {
  loadEnv({ path: repositoryEnv, quiet: true });
  const databaseUrl = process.env['DATABASE_URL']?.trim();
  const options: Parameters<typeof postgres<Contract>>[0] = databaseUrl
    ? { contractJson, url: databaseUrl }
    : { contractJson };
  return postgres<Contract>(options);
};

export type PostgresDatabase = ReturnType<typeof createPostgresDatabase>;
