import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { spaceHttpPlugin } from './vite-space-http-plugin';
import { workspaceAliases } from './workspace-aliases';

export default defineConfig(({ mode }) => {
  const repositoryFile = (path: string): string => fileURLToPath(new URL(path, import.meta.url));
  const e2eCatalog =
    mode === 'e2e-fixture' ? 'fixture' : mode === 'e2e-empty' ? 'empty' : undefined;
  const developmentModule =
    e2eCatalog === undefined
      ? repositoryFile('../../src/http/postgres-http-runtime.ts')
      : repositoryFile('../../test/support/e2e-http-runtime.ts');

  return {
    resolve: { alias: workspaceAliases() },
    plugins: [
      react(),
      tailwindcss(),
      spaceHttpPlugin({
        developmentModule,
        previewModule: repositoryFile('./dist-http/postgres-http-runtime.js'),
        ...(e2eCatalog === undefined
          ? {}
          : { runtimeOptions: { catalog: e2eCatalog, startup: true } }),
      }),
    ],
    server: {
      port: 5173,
      strictPort: true,
    },
  };
});
