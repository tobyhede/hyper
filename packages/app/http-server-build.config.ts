import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Relative to this module, not to the working directory. `resolve()` would
// anchor on cwd, which is the app package only because the one script that
// loads this config is filtered to it — from the repo root the same strings
// climb clear out of the checkout.
const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  // The SSR entry lives above the app workspace, where pnpm deliberately has no
  // @project/* symlinks. These build-only mappings let Rollup inline the
  // browser-safe workspace packages into one Node artifact; the browser Vite
  // config still resolves packages through the app's declared dependencies.
  resolve: {
    alias: {
      '@project/core': here('../core/src/index.ts'),
      '@project/graph': here('../graph/src/index.ts'),
      '@project/persistence': here('../persistence/src/index.ts'),
    },
  },
  build: {
    ssr: here('../../src/http/postgres-http-runtime.ts'),
    outDir: 'dist-http',
    emptyOutDir: true,
    rollupOptions: {
      output: { entryFileNames: 'postgres-http-runtime.js' },
    },
  },
  ssr: {
    noExternal: ['@project/core', '@project/graph', '@project/persistence'],
  },
});
