import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { spaceFilePlugin } from './vite-space-file-plugin';

const resolve = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss(), spaceFilePlugin()],
  resolve: {
    alias: {
      '@project/core': resolve('../core/src/index.ts'),
      '@project/graph': resolve('../graph/src/index.ts'),
      '@project/react-flow-adapter': resolve('../react-flow-adapter/src/index.ts'),
      '@project/ui': resolve('../ui/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
