import { cardFrontmatterSchema, type CardFrontmatter } from '@project/core';
import { parse as parseYaml } from 'yaml';

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

/**
 * Split a card file into its frontmatter and its body (ADR 0020).
 *
 * The fence is hand-rolled and the YAML is not: a file opens with `---`, and
 * the *first* subsequent line that is exactly `---` closes it. Only the first
 * closes, which is what makes a horizontal rule in the body an ordinary
 * horizontal rule rather than a parse error.
 */
export function parseCardFile(file: CardFile): ParseCardFileResult {
  const fail = (kind: CardFileErrorKind, message: string): ParseCardFileResult => ({
    ok: false,
    errors: [{ kind, path: file.path, message: `${file.path}: ${message}` }],
  });

  if (!file.text.startsWith(FENCE)) {
    return fail('missing-frontmatter', 'does not open with a "---" frontmatter fence');
  }
  // The closing fence is a line of exactly `---`, and the file may end on it
  // with no trailing newline. Matching from the opening fence's own newline
  // means the opener can never also be read as the closer.
  const closing = /\n---(?:\n|$)/.exec(file.text.slice(FENCE.length - 1));
  if (!closing) {
    return fail('unterminated-frontmatter', 'opens a "---" frontmatter fence that never closes');
  }
  const close = FENCE.length - 1 + closing.index;

  let yaml: unknown;
  try {
    yaml = parseYaml(file.text.slice(FENCE.length, close + 1));
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
  const body = file.text.slice(close + closing[0].length).replace(/^\n/, '');
  return { ok: true, frontmatter: parsed.data, body };
}

/** YAML's own errors are multi-line and end in a source excerpt; the first line says what broke. */
function describe(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.split('\n')[0] ?? message;
}
