import {
  declaresResourceKind,
  resourceFrontmatterSchema,
  resourceSchema,
  importResourceFrontmatterSchema,
  type Resource,
  type ResourceDocument,
  type ImportResource,
  type ImportResourceFrontmatter,
  type UUID,
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
interface FrontmatterSchema<T extends ImportResourceFrontmatter> {
  safeParse(value: unknown):
    | { success: true; data: T }
    | {
        success: false;
        error: { issues: { code: string; path: PropertyKey[]; message: string }[] };
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

  const { id, document } = decodeEnvelope(decoded.frontmatter, decoded.body);
  const resource = resourceSchema.safeParse({ id, ...document });
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

  const { id, document } = decodeEnvelope(decoded.frontmatter, decoded.body);
  const resource: ImportResource = { document };
  if (id !== undefined) resource.id = id;
  return { ok: true, resource };
}

/** A Resource decoded from its file: the id the file declares, if any, and its document. */
interface DecodedResource {
  readonly id: UUID | undefined;
  readonly document: ResourceDocument;
}

/**
 * A Resource file's frontmatter is flat and a Resource is an envelope
 * (ADR 0128): the frontmatter's id, title and kind are the envelope's, and its
 * other keys are the kind's content. A Markdown Resource's content is the
 * file's body.
 */
function decodeEnvelope(frontmatter: ImportResourceFrontmatter, body: string): DecodedResource {
  switch (frontmatter.kind) {
    case 'markdown': {
      const { id, title, kind } = frontmatter;
      return { id, document: { title, kind, content: { source: body } } };
    }
    case 'reference':
      return contentFromRest(frontmatter);
    case 'space':
      return contentFromRest(frontmatter);
    case 'image':
      return contentFromRest(frontmatter);
    case 'ur': {
      const { id, title, kind } = frontmatter;
      return { id, document: { title, kind, content: {} } };
    }
  }
}

/** The frontmatter keys every kind shares: the envelope's. */
interface EnvelopeFrontmatter {
  readonly id?: UUID | undefined;
  readonly title: string;
  readonly kind: string;
}

/** A Resource decoded from one kind's frontmatter, its `content` the frontmatter's other keys. */
interface DecodedKindResource<F extends EnvelopeFrontmatter> {
  readonly id: UUID | undefined;
  readonly document: {
    readonly title: string;
    readonly kind: F['kind'];
    readonly content: Omit<F, keyof EnvelopeFrontmatter>;
  };
}

/** One kind's frontmatter with every key but the envelope's moved under `content`. */
function contentFromRest<F extends EnvelopeFrontmatter>(frontmatter: F): DecodedKindResource<F> {
  const { id, title, kind, ...content } = frontmatter;
  return { id, document: { title, kind, content } };
}

function decodeResourceFile<T extends ImportResourceFrontmatter>(
  file: ResourceFile,
  schema: FrontmatterSchema<T>,
): { ok: true; frontmatter: T; body: string } | ResourceFileFailure {
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
    // A kindless file is read as an Ur Resource, so another kind's key is
    // refused as unknown; the message says why the key is unknown.
    const kindless = declaresResourceKind(yaml)
      ? ''
      : '; the file declares no kind, so it is read as an Ur Resource — declare its "kind:" if it is another kind';
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => ({
        kind: 'invalid-frontmatter',
        path: file.path,
        message: `${file.path}: ${issue.path.join('.') || '(frontmatter)'}: ${issue.message}${
          issue.code === 'unrecognized_keys' ? kindless : ''
        }`,
      })),
    };
  }

  // Only a Markdown Resource owns the bytes after the frontmatter. Check before
  // constructing the domain value: the other schemas would otherwise strip a
  // body as an unknown key and silently discard authored prose. Blank lines
  // after the fence are not a body.
  if (parsed.data.kind !== 'markdown' && split.body.trim() !== '') {
    return fail(
      'invalid-frontmatter',
      declaresResourceKind(yaml)
        ? `body: ${parsed.data.kind} resources may not have a body`
        : 'body: a resource file with no kind is an Ur Resource, which has no body; add "kind: markdown" to its frontmatter to keep the body as Markdown',
    );
  }

  return { ok: true, frontmatter: parsed.data, body: split.body };
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
 * `kind` is written for every kind, `ur` included, even though the reader
 * defaults an absent one to `ur`. A file this produced is one a human then
 * edits, and a resource that says what kind it is can be read without knowing
 * the default.
 */
export function serializeResourceFile(resource: Resource): string {
  if (resource.kind === 'markdown') {
    const { content, ...frontmatter } = resource;
    return `${FENCE}${stringifyYaml(frontmatter)}${FENCE}\n${content.source}`;
  }
  const { content, ...frontmatter } = resource;
  return `${FENCE}${stringifyYaml({ ...frontmatter, ...content })}${FENCE}\n`;
}

/** YAML's own errors are multi-line and end in a source excerpt; the first line says what broke. */
function describe(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.split('\n')[0] ?? message;
}
