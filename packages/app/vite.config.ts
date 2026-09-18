import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { spaceHttpPlugin, type SpaceHttpPluginOptions } from './vite-space-http-plugin';
import { workspaceAliases } from './workspace-aliases';

/**
 * The package alias map as a ready `resolve` config, exported so
 * `vite.sqlite.config.ts` can reuse this file's aliases directly rather than
 * importing `./workspace-aliases` a second time.
 */
export const resolveAliases = { alias: workspaceAliases() };

export default defineConfig(({ mode }) => {
  const repositoryFile = (path: string): string => fileURLToPath(new URL(path, import.meta.url));
  const memoryCatalog =
    mode === 'e2e-fixture'
      ? { catalog: 'fixture' as const }
      : mode === 'e2e-empty'
        ? { catalog: 'empty' as const }
        : mode === 'roadmap'
          ? {
              catalog: 'directory' as const,
              directory: repositoryFile('../../.scratch/v1-release/roadmap-space'),
            }
          : undefined;
  const developmentModule =
    memoryCatalog === undefined
      ? repositoryFile('../../src/http/postgres-http-runtime.ts')
      : repositoryFile('../../test/support/e2e-http-runtime.ts');

  const spaceHttpOptions: SpaceHttpPluginOptions = {
    developmentModule,
    previewModule: repositoryFile('./dist-http/postgres-http-runtime.js'),
  };
  if (memoryCatalog !== undefined) {
    spaceHttpOptions.runtimeOptions = { ...memoryCatalog, startup: true };
  }

  return {
    resolve: resolveAliases,
    plugins: [react(), tailwindcss(), spaceHttpPlugin(spaceHttpOptions)],
    server: {
      port: 5173,
      strictPort: true,
    },
  };
});
