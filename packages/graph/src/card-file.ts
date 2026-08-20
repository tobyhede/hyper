import {
  cardFrontmatterSchema,
  cardSchema,
  importCardFrontmatterSchema,
  type Card,
  type ImportCard,
} from '@project/core';
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
export type ParseImportCardFileResult =
  { ok: true; card: ImportCard } | { ok: false; errors: CardFileError[] };

type CardFileFailure = { ok: false; errors: CardFileError[] };
type Frontmatter = { kind: 'markdown' } | { kind: 'alias' };
type DecodedCandidate<T extends Frontmatter> = T extends { kind: 'markdown' }
  ? T & { body: string }
  : T;

interface FrontmatterSchema<T extends Frontmatter> {
  safeParse(value: unknown):
    | { success: true; data: T }
    | {
        success: false;
        error: { issues: { path: PropertyKey[]; message: string }[] };
      };
}

const FENCE = '---\n';

/**
 * Split a card file into its frontmatter and its body (ADR 0020).
 *
 * The fence is hand-rolled and the YAML is not. The byte-level split lives in
 * `./frontmatter`; schema validation and domain construction stay here.
 */
export function parseCardFile(file: CardFile): ParseCardFileResult {
  const decoded = decodeCardFile(file, cardFrontmatterSchema);
  if (!decoded.ok) return decoded;

  const card = cardSchema.safeParse(decoded.candidate);
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

export function parseImportCardFile(file: CardFile): ParseImportCardFileResult {
  const decoded = decodeCardFile(file, importCardFrontmatterSchema);
  if (!decoded.ok) return decoded;

  const { id, ...document } = decoded.candidate;
  const card: ImportCard = { document };
  if (id !== undefined) card.id = id;
  return { ok: true, card };
}

function decodeCardFile<T extends Frontmatter>(
  file: CardFile,
  schema: FrontmatterSchema<T>,
): { ok: true; candidate: DecodedCandidate<T> } | CardFileFailure {
  const fail = (kind: CardFileErrorKind, message: string): CardFileFailure => ({
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

  const parsed = schema.safeParse(yaml);
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
  // SAFETY: the ternary above already adds `body` exactly when `kind` is
  // `'markdown'` and leaves the value alone otherwise — precisely what
  // `DecodedCandidate<T>` demands. TypeScript cannot verify this itself
  // because a conditional type keyed on a generic `T` isn't narrowed by a
  // runtime check on a *value* of that generic type, only on a concrete union.
  return { ok: true, candidate: candidate as DecodedCandidate<T> };
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
