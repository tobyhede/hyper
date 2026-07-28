import { cardFrontmatterSchema, cardSchema, type Card } from '@project/core';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { splitFrontmatter } from './frontmatter';

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

export type ParseCardFileResult = { ok: true; card: Card } | { ok: false; errors: CardFileError[] };

const FENCE = '---\n';

/**
 * Split a card file into its frontmatter and its body (ADR 0020).
 *
 * The fence is hand-rolled and the YAML is not. The byte-level split lives in
 * `./frontmatter`; schema validation and domain construction stay here.
 */
export function parseCardFile(file: CardFile): ParseCardFileResult {
  const fail = (kind: CardFileErrorKind, message: string): ParseCardFileResult => ({
    ok: false,
    errors: [{ kind, path: file.path, message: `${file.path}: ${message}` }],
  });

  const split = splitFrontmatter(file.text);
  if (split === 'missing-frontmatter') {
    return fail('missing-frontmatter', 'does not open with a "---" frontmatter fence');
  }
  if (split === 'unterminated-frontmatter') {
    return fail('unterminated-frontmatter', 'opens a "---" frontmatter fence that never closes');
  }

  let yaml: unknown;
  try {
    yaml = parseYaml(split.yaml);
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

  // An alias is physically stored in a markdown file, but it owns no markdown
  // content (ADR 0009). Check the post-frontmatter bytes before constructing
  // the domain value: once `body` is absent from the alias schema, Zod would
  // otherwise strip it as an unknown key and silently discard authored prose.
  if (parsed.data.kind === 'alias' && split.body !== '') {
    return fail('invalid-frontmatter', 'body: alias cards may not have a body');
  }

  const candidate =
    parsed.data.kind === 'markdown' ? { ...parsed.data, body: split.body } : parsed.data;
  const card = cardSchema.safeParse(candidate);
  if (!card.success) {
    return {
      ok: false,
      errors: card.error.issues.map((issue) => ({
        kind: 'invalid-frontmatter',
        path: file.path,
        message: `${file.path}: ${issue.path.join('.') || '(card)'}: ${issue.message}`,
      })),
    };
  }

  return { ok: true, card: card.data };
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
  if (card.kind === 'alias') {
    return `${FENCE}${stringifyYaml(card)}${FENCE}\n`;
  }

  const { body, ...frontmatter } = card;
  return `${FENCE}${stringifyYaml(frontmatter)}${FENCE}\n${body}`;
}

/** YAML's own errors are multi-line and end in a source excerpt; the first line says what broke. */
function describe(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.split('\n')[0] ?? message;
}
