import {
  resourceFrontmatterSchema,
  resourceSchema,
  importResourceFrontmatterSchema,
  type Resource,
  type ImportResource,
} from '@project/core';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { splitFrontmatter } from './frontmatter';

/** A resource file as read from disk: where it was found, and its bytes as text. */
export interface ResourceFile {
  readonly path: string;
  readonly text: string;
}

export type ResourceFileErrorKind =
  'missing-frontmatter' | 'unterminated-frontmatter' | 'invalid-yaml' | 'invalid-frontmatter';

export interface ResourceFileError {
  kind: ResourceFileErrorKind;
  /** The file that failed, so a message can say which one. */
  path: string;
  message: string;
}

export type ParseResourceFileResult =
  { ok: true; resource: Resource } | { ok: false; errors: ResourceFileError[] };
export type ParseImportResourceFileResult =
  { ok: true; resource: ImportResource } | { ok: false; errors: ResourceFileError[] };

type ResourceFileFailure = { ok: false; errors: ResourceFileError[] };
type Frontmatter = { kind: 'markdown' } | { kind: 'reference' } | { kind: 'space' };
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
 * Split a resource file into its frontmatter and its body (ADR 0020).
 *
 * The fence is hand-rolled and the YAML is not. The byte-level split lives in
 * `./frontmatter`; schema validation and domain construction stay here.
 */
export function parseResourceFile(file: ResourceFile): ParseResourceFileResult {
  const decoded = decodeResourceFile(file, resourceFrontmatterSchema);
  if (!decoded.ok) return decoded;

  const resource = resourceSchema.safeParse(decoded.candidate);
  if (!resource.success) {
    return {
      ok: false,
      errors: resource.error.issues.map((issue) => ({
        kind: 'invalid-frontmatter',
        path: file.path,
        message: `${file.path}: ${issue.path.join('.') || '(resource)'}: ${issue.message}`,
      })),
    };
  }

  return { ok: true, resource: resource.data };
}

export function parseImportResourceFile(file: ResourceFile): ParseImportResourceFileResult {
  const decoded = decodeResourceFile(file, importResourceFrontmatterSchema);
  if (!decoded.ok) return decoded;

  const { id, ...document } = decoded.candidate;
  const resource: ImportResource = { document };
  if (id !== undefined) resource.id = id;
  return { ok: true, resource };
}

function decodeResourceFile<T extends Frontmatter>(
  file: ResourceFile,
  schema: FrontmatterSchema<T>,
): { ok: true; candidate: DecodedCandidate<T> } | ResourceFileFailure {
  const fail = (kind: ResourceFileErrorKind, message: string): ResourceFileFailure => ({
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

  // Only a Markdown Resource owns the bytes after the frontmatter. Check before
  // constructing the domain value: the other schemas would otherwise strip a
  // body as an unknown key and silently discard authored prose.
  if (parsed.data.kind !== 'markdown' && split.body !== '') {
    return fail('invalid-frontmatter', `body: ${parsed.data.kind} resources may not have a body`);
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
 * Write a resource back out as one file: frontmatter, fence, body (ADR 0020). The
 * inverse of {@link parseResourceFile}, and held to that by a round-trip property.
 *
 * The YAML goes through `stringify` rather than a template, so a title carrying
 * a colon — `Recap: the data model`, which the example space really has — is
 * quoted rather than written as a nested mapping. Hand-rolling the emitting side
 * is the same mistake as hand-rolling the reading side, in the direction where
 * it silently produces a file that no longer parses.
 *
 * `kind` is written even though the reader defaults it. A file this produced is
 * one a human then edits, and a resource that says what kind it is can be read
 * without knowing the default.
 */
export function serializeResourceFile(resource: Resource): string {
  if (resource.kind !== 'markdown') {
    return `${FENCE}${stringifyYaml(resource)}${FENCE}\n`;
  }

  const { body, ...frontmatter } = resource;
  return `${FENCE}${stringifyYaml(frontmatter)}${FENCE}\n${body}`;
}

/** YAML's own errors are multi-line and end in a source excerpt; the first line says what broke. */
function describe(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.split('\n')[0] ?? message;
}
