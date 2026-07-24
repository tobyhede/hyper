import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
// Imported by *relative* path, not as `@project/core`. Vite loads this config in
// Node and externalizes bare specifiers, so the package specifier would hand
// Node the workspace TypeScript source — whose extensionless relative imports
// (`export * from './schema'`) Node's ESM resolver rejects. A relative import is
// bundled by esbuild instead, which resolves them.
import { spaceFileSchema } from '../core/src/index';

/**
 * The space seam: read through a virtual module, write through a middleware.
 *
 * A space is a **directory** (ADR 0020) — a space file holding structure, and a
 * markdown file per card — so the virtual module carries both, and this is where
 * read scope is decided. Two locations, non-recursive: `*.md` beside the space
 * file, and `cards/*.md`. Non-recursion is deliberate: ADR 0001's nested spaces
 * will want subdirectories, and a recursive scan would make every one of them
 * ambiguous with card discovery.
 *
 * Read prefers `space.local.json` and falls back to `space.json`; write only
 * ever touches `space.local.json`. `SPACE_BASE_ONLY` pins reads to the base and
 * makes writes a no-op — the switch e2e throws so a stale local file left from
 * manual play can neither retarget the suite nor be clobbered by it. Only the
 * space file has a local variant; a card file is read where it is authored.
 *
 * **Saving is dev-only, but reading is not.** The write endpoint lives in
 * `configureServer`, a hook Vite calls only for the dev server, so a build
 * carries no file endpoint however the plugin is applied. The virtual module,
 * though, has to resolve in a build too — `space.ts` imports it unconditionally
 * — so this plugin cannot be `apply: 'serve'`. A build always reads the authored
 * base: baking one machine's saved arrangement into a bundle would ship local
 * working state as if it were content.
 */

const VIRTUAL_ID = 'virtual:space-file';
const RESOLVED_ID = '\0' + VIRTUAL_ID;

const SPACE_DIR = fileURLToPath(new URL('fixture', import.meta.url));
const BASE = `${SPACE_DIR}/space.json`;
const LOCAL = `${SPACE_DIR}/space.local.json`;

function readSpaceFile(baseOnly: boolean): string {
  const useLocal = !baseOnly && !process.env['SPACE_BASE_ONLY'] && existsSync(LOCAL);
  return readFileSync(useLocal ? LOCAL : BASE, 'utf8');
}

/** Markdown files in one directory, never below it. */
function markdownIn(dir: string, prefix: string): { path: string; text: string }[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => ({
      path: `${prefix}${entry.name}`,
      text: readFileSync(`${dir}/${entry.name}`, 'utf8'),
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Every card file of the space, from the two scanned locations. Sorted by path
 * so the module's contents do not depend on directory order; the order cards end
 * up in is `loadSpace`'s decision, not this one's.
 */
function readCardFiles(): { path: string; text: string }[] {
  return [...markdownIn(SPACE_DIR, ''), ...markdownIn(`${SPACE_DIR}/cards`, 'cards/')];
}

export function spaceFilePlugin(): Plugin {
  let isBuild = false;

  return {
    name: 'space-file',

    config(_config, { command }) {
      isBuild = command === 'build';
    },

    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID;
      return undefined;
    },

    load(id) {
      // Resolved in `load()`, not at config time: creating the local file for the
      // first time then needs no dev-server restart — and that server is the
      // human's, not ours to bounce. No `addWatchFile` either, so writing the
      // file the app just saved does not trigger an HMR remount mid-drag.
      if (id === RESOLVED_ID) {
        return [
          `export const spaceFile = ${readSpaceFile(isBuild)};`,
          `export const cardFiles = ${JSON.stringify(readCardFiles())};`,
        ].join('\n');
      }
      return undefined;
    },

    configureServer(server) {
      server.middlewares.use('/__space', (req, res, next) => {
        if (req.method !== 'PUT') {
          next();
          return;
        }
        // e2e forces the base and must not mutate disk. Gating the write on the
        // same switch that pins reads keeps parallel drag tests from racing on
        // the file or overwriting the guard's decoy.
        if (process.env['SPACE_BASE_ONLY']) {
          res.statusCode = 204;
          res.end();
          return;
        }

        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => {
          let parsed: unknown;
          try {
            parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          } catch {
            res.statusCode = 400;
            res.end('invalid json');
            return;
          }
          // Validate server-side, so a client bug cannot write a corrupt space
          // file over authored content. The target path is fixed above and never
          // read from the request — an endpoint taking a path from the browser is
          // an arbitrary-file-write primitive for any page the human has open.
          const result = spaceFileSchema.safeParse(parsed);
          if (!result.success) {
            res.statusCode = 400;
            res.end('does not satisfy spaceFileSchema');
            return;
          }
          writeFileSync(LOCAL, JSON.stringify(parsed, null, 2) + '\n');
          res.statusCode = 204;
          res.end();
        });
      });
    },
  };
}
