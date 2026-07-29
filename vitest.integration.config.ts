import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const resolve = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@project/core': resolve('./packages/core/src/index.ts'),
      '@project/graph': resolve('./packages/graph/src/index.ts'),
      '@project/persistence': resolve('./packages/persistence/src/index.ts'),
      '@project/react-flow-adapter': resolve('./packages/react-flow-adapter/src/index.ts'),
      '@project/ui': resolve('./packages/ui/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['test/integration/**/*.test.ts'],
    testTimeout: 30_000,
  },
});
