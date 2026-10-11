import {
  declaredId,
  declaredKind,
  decodeFileContent,
  encodeFileContent,
  isKindId,
  isRegisteredKind,
  resourceFileSchema,
  sidecarNames,
  resourceSchema,
  type Resource,
  type ResourceFileDocument,
} from '@project/core';

/** A file of a Space directory's `resources/`, as read from disk: where it was found, and its text. */
export interface ResourceFile {
  readonly path: string;
  readonly text: string;
}

export type ResourceFileErrorKind =
  'invalid-json' | 'invalid-resource-file' | 'missing-sidecar' | 'unclaimed-sidecar';

export interface ResourceFileError {
  kind: ResourceFileErrorKind;
  /** The file that failed, so a message can say which one. */
  path: string;
  message: string;
}

/** A Resource and the Resource file it was read from. */
export interface DecodedResourceFile {
  readonly path: string;
  readonly resource: Resource;
}

export type ParseResourceFilesResult =
  | { ok: true; resources: readonly DecodedResourceFile[] }
  | { ok: false; errors: ResourceFileError[] };

/** Whether a file is a Resource file, rather than a sidecar one names. */
const isResourceFile = (path: string): boolean => path.endsWith('.json');

/** The directory part of a path, with its trailing `/`, or `''` for a bare name. */
const directoryOf = (path: string): string => path.slice(0, path.lastIndexOf('/') + 1);

/** The sidecars a Resource with this id could name, by path beside its Resource file. */
const ownSidecars = (file: ResourceFile, id: string): readonly string[] =>
  sidecarNames(id).map((name) => `${directoryOf(file.path)}${name}`);

/** A Resource file's fields, the envelope's and its content's, decoded from JSON. */
type FileDecoding =
  | { readonly ok: true; readonly file: ResourceFileDocument }
  | {
      readonly ok: false;
      readonly errors: ResourceFileError[];
      /** The sidecars a refused file could name by its id, so none is reported again as unclaimed. */
      readonly ownSidecars: readonly string[];
    };

/**
 * A Resource file's JSON, refused as ADR 0128 fixes it: a `kind` is required,
 * is a kind id, and names a kind this build registers; then the envelope and
 * the kind's content are each strict.
 */
function decodeFile(file: ResourceFile): FileDecoding {
  let json: unknown;
  try {
    json = JSON.parse(file.text);
  } catch (error) {
    return {
      ok: false,
      errors: [
        {
          kind: 'invalid-json',
          path: file.path,
          message: `${file.path}: is not valid JSON — ${String(error)}`,
        },
      ],
      ownSidecars: [],
    };
  }
  const id = declaredId(json);
  const refused = (errors: ResourceFileError[]): FileDecoding => ({
    ok: false,
    errors,
    ownSidecars: id === undefined ? [] : ownSidecars(file, id),
  });
  const fail = (kind: ResourceFileErrorKind, message: string): FileDecoding =>
    refused([{ kind, path: file.path, message: `${file.path}: ${message}` }]);

  const kind = declaredKind(json);
  if (kind === undefined) {
    return fail('invalid-resource-file', 'kind: a Resource file must declare its kind');
  }
  if (!isKindId(kind)) {
    return fail(
      'invalid-resource-file',
      `kind: "${kind}" is not a kind id — a bare id or vnd.<owner>.<name>, each part ASCII letters, digits and hyphens`,
    );
  }
  if (!isRegisteredKind(kind)) {
    return fail('invalid-resource-file', `kind: "${kind}" is not a kind this build registers`);
  }

  const parsed = resourceFileSchema.safeParse(json);
  if (!parsed.success) {
    return refused(
      parsed.error.issues.map((issue) => ({
        kind: 'invalid-resource-file',
        path: file.path,
        message: `${file.path}: ${issue.path.join('.') || '(resource)'}: ${issue.message}`,
      })),
    );
  }
  return { ok: true, file: parsed.data };
}

/**
 * Read a Space directory's Resource files and the sidecars they name into
 * Resources (ADR 0128). Each `*.json` is one Resource file; each kind's file
 * codec maps its content to the document's. A Markdown Resource's source is
 * its sidecar, which must be its own `<id>.md` beside its Resource file. A
 * `.md` no Resource file names is refused, naming it, so a Resource written
 * in an older format is never silently dropped. A refused Resource file's own
 * `<id>.md` is not reported again: its refusal already names the problem.
 */
export function parseResourceFiles(files: readonly ResourceFile[]): ParseResourceFilesResult {
  const sidecars = new Map(
    files.filter(({ path }) => !isResourceFile(path)).map((file) => [file.path, file.text]),
  );
  const claimed = new Set<string>();
  const errors: ResourceFileError[] = [];
  const resources: DecodedResourceFile[] = [];

  for (const file of files) {
    if (!isResourceFile(file.path)) continue;
    const decoded = decodeFile(file);
    if (!decoded.ok) {
      errors.push(...decoded.errors);
      for (const path of decoded.ownSidecars) claimed.add(path);
      continue;
    }
    const content = decodeFileContent(decoded.file, (name) => {
      const path = `${directoryOf(file.path)}${name}`;
      const text = sidecars.get(path);
      if (text !== undefined) claimed.add(path);
      return text;
    });
    if (!content.ok) {
      errors.push({
        kind: content.kind,
        path: file.path,
        message: `${file.path}: ${content.message}`,
      });
      for (const path of ownSidecars(file, decoded.file.id)) claimed.add(path);
      continue;
    }
    const { id, title, kind } = decoded.file;
    const resource = resourceSchema.safeParse({ id, title, kind, content: content.content });
    if (!resource.success) {
      errors.push(
        ...resource.error.issues.map((issue) => ({
          kind: 'invalid-resource-file' as const,
          path: file.path,
          message: `${file.path}: ${issue.path.join('.') || '(resource)'}: ${issue.message}`,
        })),
      );
      continue;
    }
    resources.push({ path: file.path, resource: resource.data });
  }

  for (const path of sidecars.keys()) {
    if (claimed.has(path)) continue;
    errors.push({
      kind: 'unclaimed-sidecar',
      path,
      message: `${path}: no Resource file names this file; a Resource is resources/<id>.json, and a Markdown Resource's source is the <id>.md it names (ADR 0128)`,
    });
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, resources };
}

/**
 * A Resource as its files, by path relative to the Space directory: its
 * Resource file `resources/<id>.json`, and a Markdown Resource's sidecar
 * `resources/<id>.md` beside it (ADR 0128). The inverse of
 * {@link parseResourceFiles}, and held to that by a round-trip property.
 *
 * The JSON is pretty-printed with two spaces and a closing newline, keys in
 * envelope order, so a file a human then edits reads the way the published
 * examples do.
 */
export function serializeResource(resource: Resource): readonly ResourceFile[] {
  const { id, title, kind } = resource;
  const { content, sidecars } = encodeFileContent(resource);
  return [
    {
      path: `resources/${id}.json`,
      text: `${JSON.stringify({ id, title, kind, content }, null, 2)}\n`,
    },
    ...sidecars.map(({ name, text }) => ({ path: `resources/${name}`, text })),
  ];
}
