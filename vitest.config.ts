import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const resolve = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@project/core': resolve('./packages/core/src/index.ts'),
      '@project/graph': resolve('./packages/graph/src/index.ts'),
      '@project/react-flow-adapter': resolve('./packages/react-flow-adapter/src/index.ts'),
      '@project/ui': resolve('./packages/ui/src/index.ts'),
    },
  },
  test: {
    globals: true,
    /*
     * Node by default; jsdom only where something renders.
     *
     * jsdom was the global environment, and one test file in twenty-six renders
     * a component. Measured, the cumulative environment setup for `core` and
     * `graph` alone was 6.25s under jsdom against 2ms under node, with identical
     * results — and it scales with file count, not with how much DOM is used.
     *
     * The wall-clock is the smaller half of the argument. The larger one is that
     * a domain test should not be able to reach for `document` by accident:
     * `core` and `graph` have no React and no DOM by design (AGENTS.md), and
     * running them in a browser-shaped environment quietly permits what the
     * package boundary forbids.
     */
    environment: 'node',
    environmentMatchGlobs: [['packages/*/test/**/*.tsx', 'jsdom']],
    setupFiles: ['./vitest.setup.ts'],
    include: ['packages/*/test/**/*.{test,spec}.{ts,tsx}'],
    css: false,
    coverage: {
      provider: 'v8',
      // Source only. Tests, fixtures and config would otherwise inflate every
      // number and hide exactly the gaps this is here to show.
      include: ['packages/*/src/**/*.{ts,tsx}', 'packages/app/space-file-io.ts'],
      reporter: ['text', 'html'],
      /*
       * Per-package, pinned at what already holds — a ratchet, not an ambition.
       *
       * There is deliberately **no global threshold**. The repo-wide number is
       * dominated by React components that e2e covers and unit tests do not, so
       * a global gate would either sit uselessly low or invite tests written to
       * move a number. These two packages are the pure domain logic, where a
       * drop really does mean coverage was lost.
       */
      thresholds: {
        'packages/core/src/**': { statements: 96, branches: 88, functions: 95 },
        'packages/graph/src/**': { statements: 95, branches: 90, functions: 95 },
        'packages/app/space-file-io.ts': { statements: 95, branches: 93, functions: 90 },
      },
    },
  },
});
