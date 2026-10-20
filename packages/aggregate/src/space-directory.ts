import {
  importSpaceFileSchema,
  importSpaceSchema,
  type ImportSpace,
  type ImportSpaceFile,
} from '@project/core';
import { documentRefusal, parseResourceFiles } from '@project/graph';

type AggregateDirectoryErrorKind = 'discovery' | 'parsing';

export class AggregateDirectoryError extends Error {
  readonly kind: AggregateDirectoryErrorKind;
  readonly diagnostics: readonly string[];

  constructor(kind: AggregateDirectoryErrorKind, diagnostics: readonly string[]) {
    super(diagnostics.join('\n'));
    this.name = 'AggregateDirectoryError';
    this.kind = kind;
    this.diagnostics = diagnostics;
  }
}

/** A Space directory's files, by absolute path, as text. */
export interface SpaceDirectoryFiles {
  readonly spaceFile: string;
  readonly spaceText: string;
  readonly resources: readonly { readonly path: string; readonly text: string }[];
}

/** The space file's JSON value, and why it is not JSON when it is not. */
interface SpaceJson {
  readonly json: unknown;
  readonly diagnostic?: string;
}

/**
 * The space file parsed as JSON, or the diagnostic saying why it is not JSON.
 * An unparseable file leaves `json` undefined, which `documentRefusal` answers
 * `null` for.
 */
const parseSpaceJson = (spaceFile: string, spaceText: string | undefined): SpaceJson => {
  if (spaceText === undefined) return { json: undefined };
  try {
    return { json: JSON.parse(spaceText) };
  } catch (error) {
    return { json: undefined, diagnostic: `${spaceFile}: ${String(error)}` };
  }
};

/**
 * Refuse a document this version cannot read, before anything else about it is
 * answered. `documentRefusal`'s docblock is where the argument for one composed
 * gate lives. It is asked before `importSpaceFileSchema`, which would otherwise
 * answer first with a cascade of moved keys for a version it cannot read, and
 * silence for a retired space-level `graphs`; and before a read failure, because
 * a document refused outright was never going to load.
 */
const refuseDocument = (spaceFile: string, { json }: SpaceJson): void => {
  const refusal = documentRefusal(json);
  if (refusal !== null) {
    throw new AggregateDirectoryError('parsing', [`${spaceFile}: ${refusal.message}`]);
  }
};

/**
 * Refuse a space file's text whose document this version cannot read, and do
 * nothing for any other text, an unparseable one included. The filesystem
 * reader asks it when one of a Space directory's files could not be read, so
 * that a document refused outright is reported as that rather than as the
 * read failure.
 */
export const refuseSpaceDocument = (spaceFile: string, spaceText: string | undefined): void => {
  refuseDocument(spaceFile, parseSpaceJson(spaceFile, spaceText));
};

/**
 * Parse one Space directory's files, already read, into the Space Import takes.
 * The filesystem reader and the in-memory one both parse through this, so a
 * file Export would write is judged by exactly the rule Import reads it by.
 */
export const parseSingleSpace = ({
  spaceFile,
  spaceText,
  resources: resourceFiles,
}: SpaceDirectoryFiles): ImportSpace => {
  const spaceJson = parseSpaceJson(spaceFile, spaceText);
  refuseDocument(spaceFile, spaceJson);

  const diagnostics: string[] = [];
  let parsedSpaceFile: ImportSpaceFile | undefined;
  if (spaceJson.diagnostic !== undefined) {
    diagnostics.push(spaceJson.diagnostic);
  } else {
    const parsed = importSpaceFileSchema.safeParse(spaceJson.json);
    if (parsed.success) {
      parsedSpaceFile = parsed.data;
    } else {
      diagnostics.push(
        ...parsed.error.issues.map(
          (issue) => `${spaceFile}: ${issue.path.join('.') || '(space)'}: ${issue.message}`,
        ),
      );
    }
  }

  const parsedResources = parseResourceFiles(resourceFiles);
  const resources = parsedResources.ok
    ? parsedResources.resources.map(({ resource: { id, ...document } }) => ({ id, document }))
    : [];
  if (!parsedResources.ok) {
    diagnostics.push(...parsedResources.errors.map((error) => error.message));
  }

  if (diagnostics.length > 0 || parsedSpaceFile === undefined) {
    throw new AggregateDirectoryError('parsing', diagnostics);
  }

  const { id, ...document } = parsedSpaceFile;
  return importSpaceSchema.parse(
    id === undefined ? { document, resources } : { id, document, resources },
  );
};
