import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  // The SSR entry lives above the app workspace, where pnpm deliberately has no
  // @project/* symlinks. These build-only mappings let Rollup inline the
  // browser-safe workspace packages into one Node artifact; the browser Vite
  // config still resolves packages through the app's declared dependencies.
  resolve: {
    alias: {
      '@project/core': resolve('../core/src/index.ts'),
      '@project/graph': resolve('../graph/src/index.ts'),
      '@project/persistence': resolve('../persistence/src/index.ts'),
    },
  },
  build: {
    ssr: resolve('../../src/http/postgres-http-runtime.ts'),
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
