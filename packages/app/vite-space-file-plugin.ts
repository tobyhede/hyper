import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Plugin } from 'vite';
// Imported by *relative* path, not as `@project/core`. Vite loads this config in
// Node and externalizes bare specifiers, so the package specifier would hand
// Node the workspace TypeScript source — whose extensionless relative imports
// (`export * from './schema'`) Node's ESM resolver rejects. A relative import is
// bundled by esbuild instead, which resolves them.
import { spaceFileSchema } from '../core/src/index';
/**
 * What a save sends: the space file, and every card as text keyed by its id.
 *
 * Hand-checked rather than built with zod, because a bare `zod` specifier in a
 * Vite *config* module is externalized and resolved by Node from `packages/app`,
 * where it is not a dependency — the config then fails to load and the dev
 * server will not start. `spaceFileSchema` arrives by relative import, so
 * esbuild bundles it and its own zod along with it. Same rule as everything else
 * in this file's import list, one step further out.
 *
 * Ids are constrained because an id becomes a *filename*: this is the one place
 * a value from the browser reaches the filesystem, so it is bounded to a bare
 * slug rather than merely screened for `..`. The card text is not parsed here —
 * `loadSpace` is what validates a card, on the way back in.
 */
interface SavedCard {
  id: string;
  text: string;
}

/**
 * Bounded, not merely screened. An id becomes a *filename*, and the anchored
 * character class already rules out `..`, separators, null bytes and newlines —
 * but length is a separate axis: an id of 300 characters passes every character
 * test and then fails the write with `ENAMETOOLONG` on any filesystem with a
 * 255-byte `NAME_MAX`. 64 is well beyond anything an author would type and well
 * inside every limit.
 */
const CARD_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

/** The space file as zod hands it back — unknown keys stripped. */
type SpaceFile = ReturnType<typeof spaceFileSchema.parse>;

function parseSavedSpace(value: unknown): { spaceFile: SpaceFile; cards: SavedCard[] } | null {
  if (typeof value !== 'object' || value === null) return null;
  const { spaceFile, cards } = value as { spaceFile?: unknown; cards?: unknown };
  // Keep what zod returns, not what arrived. `z.object` strips unknown keys, and
  // discarding `.data` in favour of the original threw that away — every
  // attacker-chosen key in the request survived into the authored `space.json`.
  // Validating and then writing the unvalidated value is not validation.
  const validated = spaceFileSchema.safeParse(spaceFile);
  if (!validated.success) return null;
  if (!Array.isArray(cards)) return null;

  const parsed: SavedCard[] = [];
  for (const card of cards as unknown[]) {
    if (typeof card !== 'object' || card === null) return null;
    const { id, text } = card as { id?: unknown; text?: unknown };
    if (typeof id !== 'string' || !CARD_ID.test(id)) return null;
    if (typeof text !== 'string') return null;
    parsed.push({ id, text });
  }
  return { spaceFile: validated.data, cards: parsed };
}

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
 * The space directory to open, or `null` for none. "Which space opens" turns on
 * whether a path was supplied, so no other switch grows a second meaning.
 *
 * A server-side input, read once at config load: the server is the only thing
 * that can read a directory, and the client must never name one. Resolved
 * against the server's own working directory, so `SPACE_DIR=fixture` means what
 * it looks like when run from `packages/app`.
 *
 * **The directory need not exist.** Pointing at one that does not yet is how you
 * ask for a new space *somewhere* — the app mints one (ADR 0018) and the first
 * save brings the directory into being, after which it opens like any other. A
 * space with nowhere to live could never survive a reload, which is what made
 * "create a card and reload" impossible to deliver until now.
 */
const SPACE_DIR: string | null = process.env['SPACE_DIR']
  ? resolve(process.cwd(), process.env['SPACE_DIR'])
  : null;

/** Whether a directory holds a space yet, as opposed to naming where one will go. */
const holdsSpace = (dir: string | null): dir is string =>
  dir !== null && existsSync(spaceFilePath(dir));

const spaceFilePath = (dir: string): string => `${dir}/space.json`;

/** Whether this server may write. e2e clears it; a build never gets here. */
const readOnly = (): boolean => Boolean(process.env['SPACE_READ_ONLY']);

/** Enough for any hand-authored space, small enough that a runaway or hostile
 *  PUT cannot balloon the dev server's memory — the body is buffered whole. */
const MAX_BODY_BYTES = 10 * 1024 * 1024;

/**
 * Whether a request's `Origin` names this machine.
 *
 * Absent means no browser sent it — `curl`, a test runner's request context —
 * and is allowed: the threat this guards against is a *web page*, and browsers
 * always send `Origin` on a PUT. `'null'` (a sandboxed iframe, a `file://`
 * document) is not absent and is refused.
 *
 * Compared against the origin because that is the one thing a rebinding attack
 * cannot forge. Rebinding changes what a name resolves to, not what the page
 * calls itself, so the attacker's document stays `http://evil.example:5273`
 * while its `Host` header — the value the attack does control — reads the same.
 */
function fromLoopback(origin: string | undefined): boolean {
  if (origin === undefined) return true;
  try {
    const { hostname } = new URL(origin);
    return hostname === 'localhost' || hostname === '[::1]' || hostname.startsWith('127.');
  } catch {
    return false;
  }
}

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
  mkdirSync(dirname(target), { recursive: true });
  const temp = `${target}.tmp`;
  writeFileSync(temp, contents);
  renameSync(temp, target);
}

/**
 * Write only if the bytes differ. A drag changes no card body, so without this
 * every save would rewrite every card file — the write amplification the prior
 * art warns about, and the reason Logseq's own docs graph carries churn nobody
 * asked for. Returns whether anything was written, for the response.
 */
function writeIfChanged(target: string, contents: string): boolean {
  if (existsSync(target) && readFileSync(target, 'utf8') === contents) return false;
  writeSafely(target, contents);
  return true;
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
  if (!holdsSpace(dir)) {
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

    // Returned, not registered inline. Vite calls `configureServer` hooks
    // *before* it installs its own middlewares and collects what they return as
    // post-hooks, run after. Registering here directly put `/__space` at
    // position 0 of the connect stack — ahead of `hostCheckMiddleware`, the
    // defence added for CVE-2025-24010, which never ran for this route.
    //
    // That is the DNS-rebinding hole: a page on `http://evil.example:5273/`
    // whose name is re-pointed at 127.0.0.1 issues a *same-origin* PUT here, so
    // no CORS preflight applies, and the `Host: evil.example` header that Vite
    // would reject on any other route was never inspected. Returning the
    // registration puts this route behind the host check like everything else.
    configureServer(server) {
      return () => {
        server.middlewares.use('/__space', (req, res, next) => {
          if (req.method !== 'PUT') {
            next();
            return;
          }
          // Belt and braces behind the host check above: the request must come
          // from a loopback origin, or from no browser at all. Under rebinding
          // the attacker's page still carries its own origin — `evil.example` —
          // because rebinding changes what the name *resolves to*, not what the
          // page is called. Deliberately not compared against `Host`, which is
          // the header the attack controls.
          if (!fromLoopback(req.headers.origin)) {
            res.statusCode = 403;
            res.end('cross-origin save refused');
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
          // With no `SPACE_DIR` at all there is nowhere to write — a build, or a
          // server started to look rather than to author. Naming a directory that
          // does not exist yet is different, and is how a minted space gets a home.
          if (!SPACE_DIR) {
            res.statusCode = 501;
            res.end('no SPACE_DIR: this space has nowhere to be written');
            return;
          }
          const dir = SPACE_DIR;

          // Bounded. Without a cap a single PUT can balloon the dev server's
          // memory, and the body is buffered whole before it is parsed.
          const chunks: Buffer[] = [];
          let size = 0;
          let oversized = false;
          req.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > MAX_BODY_BYTES) {
              oversized = true;
              chunks.length = 0;
              return;
            }
            chunks.push(chunk);
          });
          req.on('end', () => {
            if (oversized) {
              res.statusCode = 413;
              res.end('space too large');
              return;
            }
            let parsed: unknown;
            try {
              parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            } catch {
              res.statusCode = 400;
              res.end('invalid json');
              return;
            }
            // Validate server-side, so a client bug cannot write a corrupt space
            // file over authored content — which is now the *authored* file, not
            // a local copy of it, so this is the only thing guarding it. The
            // target path is fixed above and never read from the request: an
            // endpoint taking a path from the browser is an arbitrary-file-write
            // primitive for any page the human has open.
            //
            // Card files are not written here yet. Nothing in the app creates or
            // edits one, so the endpoint stays a space-file writer until
            // something does — `serializeCardFile` in `@project/graph` is the
            // half that exists, waiting for a consumer.
            const payload = parseSavedSpace(parsed);
            if (!payload) {
              res.statusCode = 400;
              res.end('does not satisfy the saved-space shape');
              return;
            }
            const { spaceFile, cards } = payload;

            // Every path is derived here, from an id this server has just
            // validated as a bare slug — never taken from the request. An
            // endpoint that accepts a path is an arbitrary-file-write primitive
            // for any page the human has open, and that stays true however the
            // payload grows.
            //
            // A card already on disk is rewritten where it sits, so an author
            // who put `intro.md` beside the space file keeps it there. Only a
            // card this server has never seen is placed, and it goes in `cards/`.
            let written = 0;
            try {
              const pathById = new Map(
                readCardFiles(dir).flatMap((file) => {
                  const id = /^---\r?\n(?:.*\r?\n)*?id:\s*(\S+)\s*\r?\n/.exec(file.text)?.[1];
                  return id ? [[id.replace(/^['"]|['"]$/g, ''), file.path] as const] : [];
                }),
              );

              for (const card of cards) {
                const target = `${dir}/${pathById.get(card.id) ?? `cards/${card.id}.md`}`;
                if (writeIfChanged(target, card.text)) written += 1;
              }
              // A card missing from the payload is never deleted. Deletion by
              // absence turns any client bug into data loss, and nothing in the
              // app deletes a card yet — when something does, it can say so
              // explicitly.
              if (writeIfChanged(spaceFilePath(dir), JSON.stringify(spaceFile, null, 2) + '\n')) {
                written += 1;
              }
            } catch (error) {
              // These writes run inside an emitter callback, where an uncaught
              // throw takes the whole dev server down rather than failing one
              // request — and that server is the human's. `EACCES`, `ENOSPC` and
              // a read-only volume are all reachable without anyone doing
              // anything wrong.
              res.statusCode = 500;
              res.end(`save failed: ${error instanceof Error ? error.message : 'unknown'}`);
              return;
            }

            // Drop the virtual module from Vite's graph so the next full page
            // load re-runs `load()` and reads what was just written. Without
            // this the module is transformed once and cached, and a reload
            // re-serves the space as it was at server start — the file on disk
            // changes and the app never sees it. Deliberately *not* an HMR push:
            // invalidating leaves the open page alone, so a save cannot remount
            // the graph mid-drag, which is the feedback loop this seam has
            // always avoided.
            const cached = server.moduleGraph.getModuleById(RESOLVED_ID);
            if (cached) server.moduleGraph.invalidateModule(cached);

            res.statusCode = 204;
            res.setHeader('x-space-files-written', String(written));
            res.end();
          });
        });
      };
    },
  };
}
