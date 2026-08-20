import 'dotenv/config';
import { defineConfig } from '@prisma-next/postgres/config';

const databaseUrl = process.env['DATABASE_URL']?.trim();

const config: Parameters<typeof defineConfig>[0] = databaseUrl
  ? {
      contract: './src/prisma/contract.prisma',
      db: { connection: databaseUrl },
      migrations: { dir: './migrations' },
    }
  : {
      contract: './src/prisma/contract.prisma',
      migrations: { dir: './migrations' },
    };

export default defineConfig(config);
