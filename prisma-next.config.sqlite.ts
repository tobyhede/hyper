import { defineConfig } from '@prisma-next/sqlite/config';
import { sqliteMigrationComposition } from './src/sqlite/composition';

const sqlitePath = sqliteMigrationComposition().path;

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
