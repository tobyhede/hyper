import 'dotenv/config';
import { defineConfig } from '@prisma-next/postgres/config';

const databaseUrl = process.env['DATABASE_URL'];

export default defineConfig({
  contract: './src/prisma/contract.prisma',
  ...(databaseUrl === undefined ? {} : { db: { connection: databaseUrl } }),
  migrations: {
    dir: './migrations',
  },
});
