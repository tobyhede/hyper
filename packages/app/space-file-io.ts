import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';
// Imported by *relative* path, not as `@project/core`. This module is bundled
// into `vite.config.ts`, which Vite loads in Node with bare specifiers
// externalized — the package specifier would hand Node the workspace TypeScript
// source, whose extensionless relative imports (`export * from './schema'`) its
// ESM resolver rejects, and the dev server would not start. Same rule as the
// plugin that imports this.
import { spaceFileSchema } from '../core/src/index';

/**
 * The save endpoint's actual work: validating a payload from the browser, and
 * deciding which bytes land in which file.
 *
 * Split out of `vite-space-file-plugin.ts` so it can be tested. Everything here
 * was reachable only through a Vite config module — including `CARD_ID`, which
 * is the control standing between a `PUT` and an arbitrary file write, and the
 * write-if-changed guard that keeps a drag from rewriting every card body. The
 * plugin keeps what is genuinely Vite's: the middleware, the virtual module,
 * and reading `SPACE_DIR`.
 */

/** What a save sends: the space file, and every card as text keyed by its id. */
export interface SavedCard {
  id: string;
  text: string;
}

/** The space file as zod hands it back — unknown keys stripped. */
export type SpaceFile = ReturnType<typeof spaceFileSchema.parse>;

/**
 * A card id, which becomes a *filename*.
 *
 * This is the one place a value from the browser reaches the filesystem, so it
 * is bounded to a bare slug rather than merely screened for `..`: anchored, so
 * no separator, traversal, null byte or newline can appear anywhere in it.
 *
 * Length is a separate axis from character set. An id of 300 characters passes
 * every character test and then fails the write with `ENAMETOOLONG` on any
 * filesystem with a 255-byte `NAME_MAX` — inside an emitter callback, where the
 * throw takes the dev server down rather than failing one request. 64 is well
 * beyond anything an author would type and well inside every limit.
 */
export const CARD_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

/**
 * Whether a card's id is safe to turn into a filename.
 *
 * Only asked of a card this server has **never seen**. A card already on disk
 * has its path read from disk (`cardPathById`), so its id is a `Map` key and
 * never touches the filesystem — and requiring the slug of it anyway rejected
 * ids the domain accepts. `idSchema` is `z.string().min(1)`, so `intro.v2`,
 * `section one` and non-ASCII ids all load happily and then failed every
 * subsequent save with a 400 the author never saw.
 */
export const canDeriveFilename = (id: string): boolean => CARD_ID.test(id);

/**
 * Enough for any hand-authored space, small enough that a runaway or hostile
 * PUT cannot balloon the dev server's memory — the body is buffered whole
 * before it can be parsed.
 */
export const MAX_BODY_BYTES = 10 * 1024 * 1024;

export const spaceFilePath = (dir: string): string => `${dir}/space.json`;

/** Whether a directory holds a space yet, as opposed to naming where one will go. */
export const holdsSpace = (dir: string | null): dir is string =>
  dir !== null && existsSync(spaceFilePath(dir));

/**
 * Hand-checked rather than built with zod, because a bare `zod` specifier in a
 * module bundled into a Vite *config* is externalized and resolved by Node from
 * `packages/app`, where it is not a dependency. `spaceFileSchema` arrives by
 * relative import, so esbuild bundles it and its own zod along with it.
 *
 * Returns what zod produced, never the original: `z.object` strips unknown
 * keys, and handing back the input instead would let any key in the request
 * survive into the authored `space.json`. Validating and then writing the
 * unvalidated value is not validation.
 */
export function parseSavedSpace(
  value: unknown,
): { spaceFile: SpaceFile; cards: SavedCard[] } | null {
  if (typeof value !== 'object' || value === null) return null;
  const { spaceFile, cards } = value as { spaceFile?: unknown; cards?: unknown };
  const validated = spaceFileSchema.safeParse(spaceFile);
  if (!validated.success) return null;
  if (!Array.isArray(cards)) return null;

  const parsed: SavedCard[] = [];
  for (const card of cards as unknown[]) {
    if (typeof card !== 'object' || card === null) return null;
    const { id, text } = card as { id?: unknown; text?: unknown };
    if (typeof id !== 'string' || id.length === 0) return null;
    if (typeof text !== 'string') return null;
    // The card must say who it is, and agree with the envelope.
    //
    // Without this, an envelope id was enough to overwrite the file it names
    // with anything at all: the id chose the target and the text was written
    // unread, so a client bug or a hostile page could replace an authored card
    // with content that fails intake on the next load, or that quietly claims a
    // different identity. Checking identity — not full validity — is what stops
    // the *target* and the *content* disagreeing. `loadSpace` still owns whether
    // a card is well-formed, on the way back in.
    if (frontmatterId(text) !== id) return null;
    parsed.push({ id, text });
  }
  return { spaceFile: validated.data, cards: parsed };
}

/**
 * Whether a request's `Origin` names this machine.
 *
 * Absent means no browser sent it — `curl`, a test runner's request context —
 * and is allowed: the threat this guards against is a *web page*, and browsers
 * always send `Origin` on a PUT. `'null'` (a sandboxed iframe, a `file://`
 * document) is not absent and is refused.
 *
 * Compared against the origin because that is the one thing a DNS-rebinding
 * attack cannot forge. Rebinding changes what a name resolves to, not what the
 * page calls itself, so the attacker's document stays `http://evil.example`
 * while its `Host` header — the value the attack does control — reads the same.
 */
export function fromLoopback(origin: string | undefined): boolean {
  if (origin === undefined) return true;
  try {
    const { hostname } = new URL(origin);
    return hostname === 'localhost' || hostname === '[::1]' || LOOPBACK_IPV4.test(hostname);
  } catch {
    return false;
  }
}

/**
 * The whole of 127.0.0.0/8, and nothing that merely starts like it.
 *
 * A `startsWith('127.')` test reads as equivalent and is not: `127.evil.example`
 * is a hostname an attacker can register and point at 127.0.0.1, so the guard
 * above would have accepted the very page it exists to refuse. Anchored, and
 * each octet must actually be a number.
 */
const LOOPBACK_IPV4 = /^127(?:\.\d{1,3}){3}$/;

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
export function writeSafely(target: string, contents: string): void {
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
export function writeIfChanged(target: string, contents: string): boolean {
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
export function readCardFiles(dir: string): { path: string; text: string }[] {
  return [...markdownIn(dir, ''), ...markdownIn(`${dir}/cards`, 'cards/')];
}

/**
 * A card file's frontmatter `id`, which is its identity — never its filename
 * (ADR 0020). Quotes stripped, because YAML permits them and the id does not
 * include them.
 *
 * The frontmatter block is isolated *first*, then searched. Scanning from the
 * opening fence for the first `id:` instead — which is what this used to do —
 * never stopped at the closing fence, so a card with no id in its frontmatter
 * and `id: something` anywhere in its **body** reported that as its identity.
 * This decides which file a card is written back to, so a body line winning
 * silently redirects a write.
 */
export function frontmatterId(text: string): string | undefined {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1];
  if (frontmatter === undefined) return undefined;
  // The rest of the line, not the first run of non-space. `idSchema` is
  // `z.string().min(1)` and YAML's unquoted scalars carry spaces, so `\S+` read
  // `section one` as `section` — and once the envelope id has to match this,
  // reading it wrong rejects a card that loads perfectly well.
  const id = /^id:[ \t]*(.+?)[ \t\r]*$/m.exec(frontmatter)?.[1];
  return id?.replace(/^['"]|['"]$/g, '');
}

/**
 * Where each card already on disk lives, keyed by its frontmatter id.
 *
 * This is what keeps a card where its author put it: someone who wrote
 * `intro.md` beside the space file keeps it there rather than having a second
 * copy appear under `cards/`.
 */
export function cardPathById(dir: string): Map<string, string> {
  return new Map(
    readCardFiles(dir).flatMap((file) => {
      const id = frontmatterId(file.text);
      return id ? [[id, file.path] as const] : [];
    }),
  );
}

/**
 * A card the server has never seen whose id cannot become a filename. Distinct
 * from a filesystem failure so the endpoint can answer 400 (the payload is
 * unwritable) rather than 500 (the disk refused).
 */
export class UnwritableCardError extends Error {
  // Declared rather than a parameter property: `erasableSyntaxOnly` is on, and
  // a parameter property is syntax that has to be *emitted*, not erased.
  readonly cardId: string;

  constructor(cardId: string) {
    super(`card "${cardId}" is new and its id cannot be used as a filename`);
    this.name = 'UnwritableCardError';
    this.cardId = cardId;
  }
}

/**
 * Write a whole space, returning how many files actually changed.
 *
 * Every path is derived here, from an id already validated as a bare slug —
 * never taken from the request. An endpoint that accepts a path is an
 * arbitrary-file-write primitive for any page the human has open, and that
 * stays true however the payload grows.
 *
 * A card missing from the payload is **never deleted**. Deletion by absence
 * turns any client bug into data loss, and nothing in the app deletes a card
 * yet — when something does, it can say so explicitly.
 *
 * Throws on any filesystem failure (`EACCES`, `ENOSPC`, a read-only volume).
 * The caller runs inside an emitter callback and must catch: an uncaught throw
 * there takes the whole dev server down rather than failing one request.
 */
export function writeSpace(dir: string, spaceFile: SpaceFile, cards: SavedCard[]): number {
  const pathById = cardPathById(dir);

  let written = 0;
  for (const card of cards) {
    const known = pathById.get(card.id);
    // The slug is required only to *invent* a path. A card already on disk is
    // written back where it sits, so its id never reaches the filesystem and
    // any id the domain accepts is fine here.
    if (known === undefined && !canDeriveFilename(card.id)) {
      throw new UnwritableCardError(card.id);
    }
    const target = `${dir}/${known ?? `cards/${card.id}.md`}`;
    if (writeIfChanged(target, card.text)) written += 1;
  }
  if (writeIfChanged(spaceFilePath(dir), JSON.stringify(spaceFile, null, 2) + '\n')) {
    written += 1;
  }
  return written;
}
