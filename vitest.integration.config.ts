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
    /**
     * One database, so one file at a time (issue `12`).
     *
     * Truncation here is global by design — `--dangerous-truncate` deletes all
     * Hyper content (ADR 0030), and `truncateHyperContent` is what the
     * truncate-mode tests exercise. Run in parallel worker threads against the
     * single `DATABASE_URL`, one file's truncation deletes rows another file is
     * mid-assertion on, and the failure surfaces in whichever file lost the
     * race. No amount of per-test fixture cleanup can fix that, because the
     * behaviour under test is *supposed* to delete other spaces' rows.
     */
    fileParallelism: false,
  },
});
