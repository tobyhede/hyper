import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { inlineScriptSources, mountHeaders } from './mount-headers';
import { workspaceAliases } from './workspace-aliases';

/**
 * The static build for Mounting (ADR 0130): `pnpm build:mount` writes it to
 * `dist-mount`, with every asset under a content-hashed name, for a static
 * host that answers every product URL with `index.html`.
 *
 * It is the application's own page composed by the mount entry,
 * `src/mount-main.tsx`, instead of the HTTP entry, so no host stands behind
 * it. `VITE_HYPER_DEFAULT_SOURCE`, read at build time, names the GitHub
 * location the page mounts when its address has no `source`.
 */

const HTTP_ENTRY = '/src/main.tsx';
const MOUNT_ENTRY = '/src/mount-main.tsx';

/**
 * The served page with the mount entry in place of the HTTP entry, so the two
 * builds share one `index.html` and its startup view.
 */
const mountEntry = (): Plugin => ({
  name: 'hyper-mount-entry',
  transformIndexHtml: {
    order: 'pre',
    handler: (html) => {
      if (!html.includes(`src="${HTTP_ENTRY}"`)) {
        throw new Error(
          `index.html no longer loads ${HTTP_ENTRY}, which the mount build replaces.`,
        );
      }
      return html.replace(`src="${HTTP_ENTRY}"`, `src="${MOUNT_ENTRY}"`);
    },
  },
});

/** The Cloudflare `_headers` file, hashing the inline scripts of the page as built. */
const cloudflareHeaders = (): Plugin => ({
  name: 'hyper-mount-headers',
  apply: 'build',
  // After Vite's own HTML plugin, which writes `index.html` into the bundle.
  enforce: 'post',
  generateBundle(_options, bundle) {
    const page = bundle['index.html'];
    if (page?.type !== 'asset') throw new Error('The mount build wrote no index.html to hash.');
    const html =
      page.source instanceof Uint8Array ? new TextDecoder().decode(page.source) : page.source;
    this.emitFile({
      type: 'asset',
      fileName: '_headers',
      source: mountHeaders(inlineScriptSources(html)),
    });
  },
});

export default defineConfig({
  resolve: { alias: workspaceAliases() },
  plugins: [react(), tailwindcss(), mountEntry(), cloudflareHeaders()],
  build: { outDir: 'dist-mount', emptyOutDir: true },
});
