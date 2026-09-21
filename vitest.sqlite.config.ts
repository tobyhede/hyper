import { defineConfig } from 'vitest/config';
import baseConfig from './vitest.config';

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    environment: 'node',
    /**
     * The `sqlite-*` files, which only this database can run, plus the
     * `database-*` files, which declare one arm per database target and run
     * here as their SQLite arm. Without the second pattern those arms executed
     * only in the `postgres` job, and `pnpm test:integration:sqlite` could pass
     * with the SQLite HTTP startup and CLI paths entirely unexercised.
     */
    include: ['test/integration/{sqlite,database}-*.test.ts'],
    /**
     * Which database this run can reach. The `sqlite` CI job migrates
     * `SQLITE_PATH` and brings up no PostgreSQL, so the `database-*` files read
     * this to run their SQLite arm alone — running the PostgreSQL arm here
     * would fail on a database this job never starts, exactly as running the
     * SQLite arm under `vitest.integration.config.ts` made the `postgres` job
     * depend on a SQLite migration it does not perform.
     */
    env: { ...baseConfig.test?.env, HYPER_DATABASE_TARGET: 'sqlite' },
    testTimeout: 30_000,
    fileParallelism: false,
  },
});
