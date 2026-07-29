import 'dotenv/config';
import postgres from '@prisma-next/postgres/runtime';
import type { Contract } from './contract.d';
import contractJson from './contract.json' with { type: 'json' };

const databaseUrl = process.env['DATABASE_URL']?.trim();

export const db = postgres<Contract>({
  contractJson,
  ...(databaseUrl ? { url: databaseUrl } : {}),
});
