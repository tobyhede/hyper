import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import {
  importSpaceFileSchema,
  importSpaceSchema,
  type ImportSpace,
  type ImportSpaceFile,
} from '@project/core';
import { documentRefusal, parseImportThingFile } from '@project/graph';
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

const discoverThingFiles = async (spaceDirectory: string): Promise<string[]> => {
  const rootFiles = await markdownFilesIn(spaceDirectory);
  let nestedFiles: string[];
  try {
    nestedFiles = await markdownFilesIn(join(spaceDirectory, 'things'));
  } catch (error) {
    if (!isMissingFile(error)) throw error;
    nestedFiles = [];
  }

  return [...rootFiles, ...nestedFiles].sort((left, right) =>
    compareOrdinal(relative(spaceDirectory, left), relative(spaceDirectory, right)),
  );
};

export const readSingleSpace = async (inputPath: string): Promise<ImportSpace> => {
  let spaceFile: string;
  let thingPaths: string[];
  try {
    spaceFile = await resolveSpaceFile(inputPath);
    const spaceDirectory = dirname(spaceFile);
    thingPaths = await discoverThingFiles(spaceDirectory);
  } catch (error) {
    throw new AggregateDirectoryError('discovery', [String(error)]);
  }

  const readPaths = [spaceFile, ...thingPaths];
  const readResults = await Promise.allSettled(readPaths.map((path) => readFile(path, 'utf8')));
  const readDiagnostics: string[] = [];
  let spaceText: string | undefined;
  const thingTexts: string[] = [];
  readResults.forEach((result, index) => {
    if (result.status === 'rejected') {
      readDiagnostics.push(`${readPaths[index] ?? spaceFile}: ${String(result.reason)}`);
    } else if (index === 0) {
      spaceText = result.value;
    } else {
      thingTexts.push(result.value);
    }
  });

  // Read apart from the things, and before the read failures are answered,
  // because the refusal below is decided from this document alone. An
  // unparseable space file leaves `spaceJson` undefined, which `documentRefusal`
  // answers `null` for — so a bad JSON diagnostic still travels with the thing
  // files' own, as it always did.
  let spaceJson: unknown = undefined;
  let spaceJsonDiagnostic: string | undefined;
  if (spaceText !== undefined) {
    try {
      spaceJson = JSON.parse(spaceText);
    } catch (error) {
      spaceJsonDiagnostic = `${spaceFile}: ${String(error)}`;
    }
  }

  // One answer, and nothing behind it — not the things, and not even a file that
  // could not be read. `documentRefusal`'s docblock is where the argument for
  // one composed gate lives; two things are only true at this call site.
  //
  // It is asked before `importSpaceFileSchema`, which runs ahead of domain
  // intake, or that schema answers first: a cascade of moved keys for a version
  // it cannot read, and silence for a retired space-level `graphs`.
  //
  // And it is asked before the read failures below, because a document refused
  // outright was never going to load. Answering the unreadable thing first sends
  // its author to fix a file permission and only then tells them the work was
  // pointless. The mirror holds and is why this is not hoisted above the read
  // itself: with no space file there is no document, so `documentRefusal`
  // decides nothing and the read failure is the only thing there is to say.
  const refusal = documentRefusal(spaceJson);
  if (refusal !== null) {
    throw new AggregateDirectoryError('parsing', [`${spaceFile}: ${refusal.message}`]);
  }

  if (readDiagnostics.length > 0 || spaceText === undefined) {
    throw new AggregateDirectoryError('discovery', readDiagnostics);
  }

  const diagnostics: string[] = [];
  let parsedSpaceFile: ImportSpaceFile | undefined;
  if (spaceJsonDiagnostic !== undefined) {
    diagnostics.push(spaceJsonDiagnostic);
  } else {
    const parsed = importSpaceFileSchema.safeParse(spaceJson);
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

  const things = thingPaths.flatMap((path, index) => {
    const parsed = parseImportThingFile({ path, text: thingTexts[index] ?? '' });
    if (!parsed.ok) {
      diagnostics.push(...parsed.errors.map((error) => error.message));
      return [];
    }
    return [parsed.thing];
  });

  if (diagnostics.length > 0 || parsedSpaceFile === undefined) {
    throw new AggregateDirectoryError('parsing', diagnostics);
  }

  const { id, ...document } = parsedSpaceFile;
  return importSpaceSchema.parse(
    id === undefined ? { document, things } : { id, document, things },
  );
};
