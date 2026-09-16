import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { spaceHttpPlugin } from './vite-space-http-plugin';
import { workspaceAliases } from './workspace-aliases';

const sqliteRuntime = fileURLToPath(
  new URL('../../src/http/sqlite-http-runtime.ts', import.meta.url),
);

export default defineConfig({
  resolve: { alias: workspaceAliases() },
  plugins: [
    react(),
    tailwindcss(),
    spaceHttpPlugin({
      developmentModule: sqliteRuntime,
      // Development-only host. `pnpm preview` stays on vite.config.ts and the
      // PostgreSQL bundled artifact (`test/unit/prisma-sqlite-foundation.test.ts`).
      previewModule: sqliteRuntime,
    }),
  ],
  server: {
    port: 5177,
    strictPort: true,
  },
});
