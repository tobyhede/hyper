import { parse as parseYaml } from 'yaml';

/**
 * Reading a card file's frontmatter: the fence, and the YAML inside it.
 *
 * Its own module, and deliberately **free of `@project/*` imports**. The save
 * endpoint has to answer "which file is this card?" with the same reader intake
 * used, and that endpoint is bundled into `vite.config.ts` — where Vite
 * externalizes bare specifiers, so a module reached from there that imports
 * `@project/core` hands *Node* the workspace TypeScript and the dev server does
 * not start at all. `card-file.ts` cannot be imported from there for exactly
 * that reason. This can, because the only thing it needs is a YAML parser.
 *
 * So the split is not decorative: it is what lets there be one reader of these
 * bytes instead of a parser on one side and a regex on the other.
 */

/** The opening fence, either line ending. Written out as LF (see
 *  `serializeCardFile`); accepted as CRLF, because a Windows checkout or a
 *  `core.autocrlf` config makes every card in the repository start `---\r\n`
 *  and reading is not the place to have an opinion about that. */
export const OPENING_FENCE = /^---\r?\n/;

export type FrontmatterSplit =
  { yaml: string; body: string } | 'missing-frontmatter' | 'unterminated-frontmatter';

/**
 * Split the fences off, or say which one was missing.
 *
 * A file opens with `---`, and the *first* subsequent line that is exactly `---`
 * closes it. Only the first closes, which is what makes a horizontal rule in the
 * body an ordinary horizontal rule rather than a parse error.
 */
export function splitFrontmatter(text: string): FrontmatterSplit {
  const opening = OPENING_FENCE.exec(text);
  if (!opening) return 'missing-frontmatter';
  const openLength = opening[0].length;

  // The closing fence is a line of exactly `---`, and the file may end on it
  // with no trailing newline. Matching from the opening fence's own newline
  // means the opener can never also be read as the closer.
  const closing = /\r?\n---[ \t]*(?:\r?\n|$)/.exec(text.slice(openLength - 1));
  if (!closing) return 'unterminated-frontmatter';
  const close = openLength - 1 + closing.index;

  return {
    // Terminated with a newline of our own rather than by taking the closing
    // fence's. `close` sits on the `\r` of a CRLF pair whose `\n` the fence
    // match consumed, so slicing one past it handed YAML a dangling `\r` — and
    // YAML, correctly, read it as part of the last field's value. Every card in
    // a CRLF checkout parsed with a trailing carriage return on whichever field
    // came last. For LF this is byte-identical to what it replaced.
    yaml: text.slice(openLength, close) + '\n',
    // The body starts on the line after the fence. One newline separates them,
    // so one newline is dropped — anything further is the author's own blank
    // line.
    body: text.slice(close + closing[0].length).replace(/^\r?\n/, ''),
  };
}

/**
 * A card file's frontmatter `id`, which is its identity and never its filename
 * (ADR 0020) — read without the schema, because a card missing a title still
 * has an identity, and a caller asking "which file is this card?" needs an
 * answer rather than a judgement.
 *
 * **A regex is a different reader**, which is why this exists at all.
 * `id: intro # stable identifier` is `intro` to YAML and `intro # stable
 * identifier` to a pattern; when the reader that decides where a card is written
 * disagrees with the one that decided what the card is, the writer cannot find
 * the card's existing file, drops a second copy under `cards/`, and the next
 * load fails on a duplicate id.
 */
export function cardFileId(text: string): string | undefined {
  const split = splitFrontmatter(text);
  if (typeof split === 'string') return undefined;
  let yaml: unknown;
  try {
    yaml = parseYaml(split.yaml);
  } catch {
    return undefined;
  }
  if (typeof yaml !== 'object' || yaml === null) return undefined;
  const id = (yaml as { id?: unknown }).id;
  // A non-string id is not one. `cardFrontmatterSchema` rejects it on the way
  // in, so there is no file to find and nothing this could usefully return.
  return typeof id === 'string' ? id : undefined;
}
