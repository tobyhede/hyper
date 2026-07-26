import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { spaceFilePlugin } from './vite-space-file-plugin';

/**
 * No `resolve.alias` for `@project/*`. Vite resolves them through the workspace
 * already — each package declares `"exports": { ".": "./src/index.ts" }` and
 * pnpm symlinks it into `node_modules` — so the alias block was a third copy of
 * the list in `tsconfig.base.json` and `vitest.config.ts`, and one more thing to
 * forget when a package is added. Removing it builds the identical bundle.
 *
 * `vitest.config.ts`'s alias is *not* redundant and must stay: the root package
 * declares no `@project/*` dependencies, so there is no symlink there to resolve
 * through.
 */
export default defineConfig({
  plugins: [react(), tailwindcss(), spaceFilePlugin()],
  server: {
    port: 5173,
    strictPort: true,
  },
});
