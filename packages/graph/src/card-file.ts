import { cardFrontmatterSchema, type Card, type CardFrontmatter } from '@project/core';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

/** A card file as read from disk: where it was found, and its bytes as text. */
export interface CardFile {
  readonly path: string;
  readonly text: string;
}

export type CardFileErrorKind =
  'missing-frontmatter' | 'unterminated-frontmatter' | 'invalid-yaml' | 'invalid-frontmatter';

export interface CardFileError {
  kind: CardFileErrorKind;
  /** The file that failed, so a message can say which one. */
  path: string;
  message: string;
}

export type ParseCardFileResult =
  { ok: true; frontmatter: CardFrontmatter; body: string } | { ok: false; errors: CardFileError[] };

const FENCE = '---\n';

/** The opening fence, either line ending. Written out as LF (see
 *  {@link serializeCardFile}); accepted as CRLF, because a Windows checkout or
 *  a `core.autocrlf` config makes every card in the repository start `---\r\n`
 *  and reading is not the place to have an opinion about that. */
const OPENING_FENCE = /^---\r?\n/;

/**
 * Split a card file into its frontmatter and its body (ADR 0020).
 *
 * The fence is hand-rolled and the YAML is not: a file opens with `---`, and
 * the *first* subsequent line that is exactly `---` closes it. Only the first
 * closes, which is what makes a horizontal rule in the body an ordinary
 * horizontal rule rather than a parse error.
 *
 * Both fences tolerate CRLF. They did not, and `startsWith('---\n')` rejected
 * every card in a CRLF checkout as having no frontmatter at all — so the
 * bundled space failed to load rather than failing to look right.
 */
export function parseCardFile(file: CardFile): ParseCardFileResult {
  const fail = (kind: CardFileErrorKind, message: string): ParseCardFileResult => ({
    ok: false,
    errors: [{ kind, path: file.path, message: `${file.path}: ${message}` }],
  });

  const opening = OPENING_FENCE.exec(file.text);
  if (!opening) {
    return fail('missing-frontmatter', 'does not open with a "---" frontmatter fence');
  }
  const openLength = opening[0].length;

  // The closing fence is a line of exactly `---`, and the file may end on it
  // with no trailing newline. Matching from the opening fence's own newline
  // means the opener can never also be read as the closer.
  const closing = /\r?\n---[ \t]*(?:\r?\n|$)/.exec(file.text.slice(openLength - 1));
  if (!closing) {
    return fail('unterminated-frontmatter', 'opens a "---" frontmatter fence that never closes');
  }
  const close = openLength - 1 + closing.index;

  let yaml: unknown;
  try {
    yaml = parseYaml(file.text.slice(openLength, close + 1));
  } catch (error) {
    return fail('invalid-yaml', `frontmatter is not valid YAML — ${describe(error)}`);
  }

  const parsed = cardFrontmatterSchema.safeParse(yaml);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => ({
        kind: 'invalid-frontmatter',
        path: file.path,
        message: `${file.path}: ${issue.path.join('.') || '(frontmatter)'}: ${issue.message}`,
      })),
    };
  }

  // The body starts on the line after the fence. One newline separates them, so
  // one newline is dropped — anything further is the author's own blank line.
  const body = file.text.slice(close + closing[0].length).replace(/^\r?\n/, '');
  return { ok: true, frontmatter: parsed.data, body };
}

/**
 * Write a card back out as one file: frontmatter, fence, body (ADR 0020). The
 * inverse of {@link parseCardFile}, and held to that by a round-trip property.
 *
 * The YAML goes through `stringify` rather than a template, so a title carrying
 * a colon — `Recap: the data model`, which the example space really has — is
 * quoted rather than written as a nested mapping. Hand-rolling the emitting side
 * is the same mistake as hand-rolling the reading side, in the direction where
 * it silently produces a file that no longer parses.
 *
 * `kind` is written even though the reader defaults it. A file this produced is
 * one a human then edits, and a card that says what kind it is can be read
 * without knowing the default.
 */
export function serializeCardFile(card: Card): string {
  const { body, ...frontmatter } = card;
  return `${FENCE}${stringifyYaml(frontmatter)}${FENCE}\n${body}`;
}

/** YAML's own errors are multi-line and end in a source excerpt; the first line says what broke. */
function describe(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.split('\n')[0] ?? message;
}
