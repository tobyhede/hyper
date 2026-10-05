import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import {
  importSpaceFileSchema,
  importSpaceSchema,
  type ImportSpace,
  type ImportSpaceFile,
} from '@project/core';
import { documentRefusal, parseImportResourceFile } from '@project/graph';
import { compareOrdinal } from '../ordinal';

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

const resolveSpaceFile = async (inputPath: string): Promise<string> => {
  const absoluteInput = resolve(inputPath);
  return (await stat(absoluteInput)).isDirectory()
    ? join(absoluteInput, 'space.json')
    : absoluteInput;
};

const markdownFilesIn = async (directory: string): Promise<string[]> =>
  (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => join(directory, entry.name));

/**
 * Shared with `aggregate-file`, which faces the same question about the same
 * kind of value: both readers have to tell "this file is not there" from every
 * other reason a read failed, and a second copy of the test is a second place
 * for it to drift.
 */
export const isMissingFile = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && error.code === 'ENOENT';

/**
 * The Resource files Import reads in a Space directory: `*.md` beside
 * `space.json` and `resources/*.md`, in ordinal order of their relative paths.
 * Export removes exactly these when a Resource leaves, so the two cannot drift.
 */
export const discoverResourceFiles = async (spaceDirectory: string): Promise<string[]> => {
  const rootFiles = await markdownFilesIn(spaceDirectory);
  let nestedFiles: string[];
  try {
    nestedFiles = await markdownFilesIn(join(spaceDirectory, 'resources'));
  } catch (error) {
    if (!isMissingFile(error)) throw error;
    nestedFiles = [];
  }

  return [...rootFiles, ...nestedFiles].sort((left, right) =>
    compareOrdinal(relative(spaceDirectory, left), relative(spaceDirectory, right)),
  );
};

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
const refuseDocument = (spaceFile: string, json: unknown): void => {
  const refusal = documentRefusal(json);
  if (refusal !== null) {
    throw new AggregateDirectoryError('parsing', [`${spaceFile}: ${refusal.message}`]);
  }
};

/**
 * Parse one Space directory's files, already read, into the Space Import takes.
 * The reader below and Export's in-memory check both parse through this, so a
 * file Export would write is judged by exactly the rule Import reads it by.
 */
export const parseSingleSpace = ({
  spaceFile,
  spaceText,
  resources: resourceFiles,
}: SpaceDirectoryFiles): ImportSpace => {
  const spaceJson = parseSpaceJson(spaceFile, spaceText);
  refuseDocument(spaceFile, spaceJson.json);

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

  const resources = resourceFiles.flatMap(({ path, text }) => {
    const parsed = parseImportResourceFile({ path, text });
    if (!parsed.ok) {
      diagnostics.push(...parsed.errors.map((error) => error.message));
      return [];
    }
    return [parsed.resource];
  });

  if (diagnostics.length > 0 || parsedSpaceFile === undefined) {
    throw new AggregateDirectoryError('parsing', diagnostics);
  }

  const { id, ...document } = parsedSpaceFile;
  return importSpaceSchema.parse(
    id === undefined ? { document, resources } : { id, document, resources },
  );
};

export const readSingleSpace = async (inputPath: string): Promise<ImportSpace> => {
  let spaceFile: string;
  let resourcePaths: string[];
  try {
    spaceFile = await resolveSpaceFile(inputPath);
    const spaceDirectory = dirname(spaceFile);
    resourcePaths = await discoverResourceFiles(spaceDirectory);
  } catch (error) {
    throw new AggregateDirectoryError('discovery', [String(error)]);
  }

  const readPaths = [spaceFile, ...resourcePaths];
  const readResults = await Promise.allSettled(readPaths.map((path) => readFile(path, 'utf8')));
  const readDiagnostics: string[] = [];
  let spaceText: string | undefined;
  const resources: { path: string; text: string }[] = [];
  readResults.forEach((result, index) => {
    const path = readPaths[index] ?? spaceFile;
    if (result.status === 'rejected') {
      readDiagnostics.push(`${path}: ${String(result.reason)}`);
    } else if (index === 0) {
      spaceText = result.value;
    } else {
      resources.push({ path, text: result.value });
    }
  });

  // With no space file there is no document, so `documentRefusal` decides
  // nothing and the read failure is the only available report.
  if (readDiagnostics.length > 0 || spaceText === undefined) {
    refuseDocument(spaceFile, parseSpaceJson(spaceFile, spaceText).json);
    throw new AggregateDirectoryError('discovery', readDiagnostics);
  }
  return parseSingleSpace({ spaceFile, spaceText, resources });
};
