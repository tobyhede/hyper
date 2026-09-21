import { defineConfig } from 'vitest/config';
import baseConfig from './vitest.config';

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    environment: 'node',
    include: ['test/integration/sqlite-*.test.ts'],
    testTimeout: 30_000,
    fileParallelism: false,
  },
});
