import 'dotenv/config';
import { defineConfig } from '@prisma-next/sqlite/config';

const sqlitePath = process.env['SQLITE_PATH']?.trim();

const config: Parameters<typeof defineConfig>[0] = sqlitePath
  ? {
      contract: './src/sqlite/contract.prisma',
      db: { connection: sqlitePath },
      migrations: { dir: './migrations-sqlite' },
    }
  : {
      contract: './src/sqlite/contract.prisma',
      migrations: { dir: './migrations-sqlite' },
    };

export default defineConfig(config);
