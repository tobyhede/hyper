import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { workspaceAliases, workspacePackages } from './workspace-aliases';

// Relative to this module, not to the working directory. `resolve()` would
// anchor on cwd, which is the app package only because the one script that
// loads this config is filtered to it — from the repo root the same strings
// climb clear out of the checkout.
const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  // Shared with the browser/dev config, so Rollup inlines exactly the packages
  // the module runner resolves.
  resolve: { alias: workspaceAliases() },
  build: {
    ssr: here('../../src/http/postgres-http-runtime.ts'),
    outDir: here('./dist-http'),
    emptyOutDir: true,
    rollupOptions: {
      output: { entryFileNames: 'postgres-http-runtime.js' },
    },
  },
  ssr: {
    noExternal: workspacePackages,
  },
});
