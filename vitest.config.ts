import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const resolve = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    /*
     * Order is load-bearing, and the list is therefore NOT alphabetical.
     *
     * A string `find` matches when the specifier equals it *or* starts with it
     * plus a slash, and the first match wins. So `@project/persistence` also
     * matches `@project/persistence/test-support` and rewrites it to
     * `…/src/index.ts/test-support`, which resolves to nothing. The subpath must
     * come first. Sorting these keys makes every test that imports the subpath
     * fail to collect.
     */
    alias: {
      '@project/core': resolve('./packages/core/src/index.ts'),
      '@project/graph': resolve('./packages/graph/src/index.ts'),
      '@project/http': resolve('./packages/http/src/index.ts'),
      '@project/persistence/test-support': resolve(
        './packages/persistence/test/backend-contract.ts',
      ),
      '@project/persistence': resolve('./packages/persistence/src/index.ts'),
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
    /*
     * Every spy is undone between tests.
     *
     * `vi.spyOn` mutates a shared global — `crypto.randomUUID` is the one this
     * repo pins — and without this each spy outlived the test that set it. A
     * test written after one that pinned the generator inherited a constant
     * uuid and passed for a reason its author never chose. Both spy sites set
     * theirs inside a test, so restoring between tests takes nothing away.
     */
    restoreMocks: true,
    environmentMatchGlobs: [['packages/*/test/**/*.tsx', 'jsdom']],
    setupFiles: ['./vitest.setup.ts'],
    include: ['packages/*/test/**/*.{test,spec}.{ts,tsx}', 'test/unit/**/*.{test,spec}.{ts,tsx}'],
    css: false,
    coverage: {
      provider: 'v8',
      // Source only. Tests, fixtures and config would otherwise inflate every
      // number and hide exactly the gaps this is here to show.
      include: ['packages/*/src/**/*.{ts,tsx}'],
      reporter: ['text', 'html'],
      /*
       * Per-package, pinned at what already holds — a ratchet, not an ambition.
       *
       * There is deliberately **no global threshold**. The repo-wide number is
       * dominated by React components that e2e covers and unit tests do not, so
       * a global gate would either sit uselessly low or invite tests written to
       * move a number. These packages are the pure domain and transport logic,
       * where a drop really does mean coverage was lost.
       *
       * `http` is gated for a demonstrated reason: its RFC 9110 media scanner
       * shipped at 69.89% statements with the whole quoted-pair escape path
       * unexercised, and nothing failed. An ungated package of pure branching
       * logic is exactly where that goes unnoticed.
       */
      thresholds: {
        'packages/core/src/**': { statements: 96, branches: 88, functions: 95 },
        'packages/graph/src/**': { statements: 95, branches: 90, functions: 95 },
        'packages/http/src/**': { statements: 98, branches: 94, functions: 96 },
        'packages/persistence/src/**': { statements: 95, branches: 90, functions: 95 },
      },
    },
  },
});
