import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { spaceHttpPlugin } from '../vite-space-http-plugin';
import { workspaceAliases } from '../workspace-aliases';

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));
const directory = process.env['BENCHMARK_DIRECTORY'];
if (directory === undefined) throw new Error('BENCHMARK_DIRECTORY is required');

export default defineConfig({
  root: here('..'),
  build: {
    outDir: here('../../../.scratch/space-thing-drag-performance/benchmark-dist'),
    emptyOutDir: true,
  },
  resolve: { alias: workspaceAliases() },
  plugins: [
    react(),
    tailwindcss(),
    spaceHttpPlugin({
      developmentModule: here('../../../scripts/space-thing-drag-benchmark/runtime.ts'),
      previewModule: here('../../../scripts/space-thing-drag-benchmark/runtime.ts'),
      runtimeOptions: { directory },
    }),
  ],
});
