import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
 * **A save writes the authored space, in place.** There is no shadow copy: the
 * `space.local.json` that used to shadow the space file died with the move to a
 * directory, because shadowing a directory needs per-file merge rules and a
 * tombstone for every deletion. Git is the undo — `git checkout` on the space
 * directory throws an arrangement away. A drag therefore dirties the worktree,
 * deliberately: ADR 0013 makes placement authored, so a drag is an edit to
 * authored content and a visible diff is the honest rendering of it.
 *
 * `SPACE_READ_ONLY` makes writes a no-op. e2e sets it, and it is what stops a
 * suite that drags cards from editing the committed fixture out from under
 * itself — with no shadow file left to absorb those writes, it is the only thing
 * standing between a test run and the authored space.
 *
 * **Saving is dev-only, but reading is not.** The write endpoint lives in
 * `configureServer`, a hook Vite calls only for the dev server, so a build
 * carries no file endpoint however the plugin is applied. The virtual module,
 * though, has to resolve in a build too — `space.ts` imports it unconditionally
 * — so this plugin cannot be `apply: 'serve'`.
 *
 * A build no longer has to *choose* the authored file over a local one: there is
 * only the authored file. The flip side is that a build now bundles whatever the
 * last save left there, because that is what "authored" means once saves write in
 * place. Committing an arrangement you did not mean to keep is a git problem now,
 * which is where it belongs.
 */

const VIRTUAL_ID = 'virtual:space-file';
const RESOLVED_ID = '\0' + VIRTUAL_ID;

/**
 * The space directory to open, or `null` for none — in which case the app mints
 * a new one (ADR 0018). "Which space opens" turns on whether a path was
 * supplied, so no other switch grows a second meaning.
 *
 * A server-side input, read once at config load: the server is the only thing
 * that can read a directory, and the client must never name one. Resolved
 * against the server's own working directory, so `SPACE_DIR=fixture` means what
 * it looks like when run from `packages/app`.
 */
const SPACE_DIR: string | null = process.env['SPACE_DIR']
  ? resolve(process.cwd(), process.env['SPACE_DIR'])
  : null;

const spaceFilePath = (dir: string): string => `${dir}/space.json`;

/** Whether this server may write. e2e clears it; a build never gets here. */
const readOnly = (): boolean => Boolean(process.env['SPACE_READ_ONLY']);

/**
 * Write via a temp file in the same directory, then rename over the target.
 * `rename(2)` is atomic within a filesystem, so a crash or a partial write
 * leaves the previous file intact rather than a truncated one.
 *
 * This did not matter while the target was a throwaway `space.local.json` — a
 * corrupt one cost nothing and was deleted to recover. It matters now that the
 * target is the authored space file, where a truncated write destroys content
 * that only git can get back. Same directory on purpose: renaming across
 * filesystems is not atomic.
 */
function writeSafely(target: string, contents: string): void {
  const temp = `${target}.tmp`;
  writeFileSync(temp, contents);
  renameSync(temp, target);
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
function readCardFiles(dir: string): { path: string; text: string }[] {
  return [...markdownIn(dir, ''), ...markdownIn(`${dir}/cards`, 'cards/')];
}

/**
 * The virtual module's source.
 *
 * With a directory, the space is read off disk here. Without one, the module
 * defers to `newSpace()` in the *client* bundle rather than importing it in
 * Node: this file is a Vite config module, where a bare `@project/*` specifier
 * would be externalized and hand Node the workspace TypeScript source. The text
 * below is browser code, so the app's own alias resolves it.
 */
function spaceModule(dir: string | null): string {
  if (!dir) {
    return [
      `import { newSpace } from '@project/graph';`,
      `const minted = newSpace();`,
      `export const spaceFile = minted.file;`,
      `export const cardFiles = minted.cardFiles;`,
    ].join('\n');
  }
  return [
    `export const spaceFile = ${readFileSync(spaceFilePath(dir), 'utf8')};`,
    `export const cardFiles = ${JSON.stringify(readCardFiles(dir))};`,
  ].join('\n');
}

export function spaceFilePlugin(): Plugin {
  return {
    name: 'space-file',

    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID;
      return undefined;
    },

    load(id) {
      // Read in `load()`, not at config time, so a save is picked up on the next
      // full page load with no dev-server restart — and that server is the
      // human's, not ours to bounce. No `addWatchFile` either, so writing the
      // files the app just saved does not trigger an HMR remount mid-drag.
      if (id === RESOLVED_ID) return spaceModule(SPACE_DIR);
      return undefined;
    },

    configureServer(server) {
      server.middlewares.use('/__space', (req, res, next) => {
        if (req.method !== 'PUT') {
          next();
          return;
        }
        // e2e must not mutate disk. With no shadow file left to absorb writes,
        // this is the only thing between a suite that drags cards and the
        // authored space it is testing against.
        if (readOnly()) {
          res.statusCode = 204;
          res.end();
          return;
        }
        // A minted space has no directory, so there is nowhere to write it. It
        // survives only as long as the tab does, which is ADR 0020's stated cost
        // — a space the app mints has a card no file describes, and it cannot
        // survive a reload until the writer grows to persist card files.
        if (!SPACE_DIR) {
          res.statusCode = 501;
          res.end('a minted space has no directory to write to yet');
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
          // file over authored content — which is now the *authored* file, not a
          // local copy of it, so this is the only thing guarding it. The target
          // path is fixed above and never read from the request: an endpoint
          // taking a path from the browser is an arbitrary-file-write primitive
          // for any page the human has open.
          //
          // Card files are not written here yet. Nothing in the app creates or
          // edits one, so the endpoint stays a space-file writer until something
          // does — `serializeCardFile` in `@project/graph` is the half that
          // exists, waiting for a consumer.
          const result = spaceFileSchema.safeParse(parsed);
          if (!result.success) {
            res.statusCode = 400;
            res.end('does not satisfy spaceFileSchema');
            return;
          }
          writeSafely(spaceFilePath(SPACE_DIR), JSON.stringify(parsed, null, 2) + '\n');
          res.statusCode = 204;
          res.end();
        });
      });
    },
  };
}
