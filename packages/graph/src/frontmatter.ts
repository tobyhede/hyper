/**
 * Reading a card file's frontmatter: the fence, and the YAML inside it.
 *
 * Kept separate from YAML/schema validation so the byte-level fence behavior is
 * explicit and independently testable.
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
