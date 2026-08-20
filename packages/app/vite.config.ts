import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { spaceHttpPlugin, type SpaceHttpPluginOptions } from './vite-space-http-plugin';
import { workspaceAliases } from './workspace-aliases';

export default defineConfig(({ mode }) => {
  const repositoryFile = (path: string): string => fileURLToPath(new URL(path, import.meta.url));
  const e2eCatalog =
    mode === 'e2e-fixture' ? 'fixture' : mode === 'e2e-empty' ? 'empty' : undefined;
  const developmentModule =
    e2eCatalog === undefined
      ? repositoryFile('../../src/http/postgres-http-runtime.ts')
      : repositoryFile('../../test/support/e2e-http-runtime.ts');

  const spaceHttpOptions: SpaceHttpPluginOptions = {
    developmentModule,
    previewModule: repositoryFile('./dist-http/postgres-http-runtime.js'),
  };
  if (e2eCatalog !== undefined) {
    spaceHttpOptions.runtimeOptions = { catalog: e2eCatalog, startup: true };
  }

  return {
    resolve: { alias: workspaceAliases() },
    plugins: [react(), tailwindcss(), spaceHttpPlugin(spaceHttpOptions)],
    server: {
      port: 5173,
      strictPort: true,
    },
  };
});
