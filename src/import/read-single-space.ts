import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import {
  importSpaceFileSchema,
  importSpaceSchema,
  type ImportSpace,
  type ImportSpaceFile,
} from '@project/core';
import {
  parseImportCardFile,
  unsupportedDocumentVersion,
  type UnsupportedVersionError,
} from '@project/graph';

type SpaceImportFileErrorKind = 'discovery' | 'parsing';

export class SpaceImportFileError extends Error {
  readonly kind: SpaceImportFileErrorKind;
  readonly diagnostics: readonly string[];

  constructor(kind: SpaceImportFileErrorKind, diagnostics: readonly string[]) {
    super(diagnostics.join('\n'));
    this.name = 'SpaceImportFileError';
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

/**
 * Order two relative paths by code unit, not by locale.
 *
 * `localeCompare` reads the host's collation, so the same space directory could
 * import its cards in a different order on a different machine. Import order is
 * observable — it is the order cards are inserted and the order a canonical
 * export will emit — so it has to come from the bytes alone.
 */
const compareOrdinal = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const markdownFilesIn = async (directory: string): Promise<string[]> =>
  (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => join(directory, entry.name));

const isMissingFile = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && error.code === 'ENOENT';

const isRegularFile = async (path: string): Promise<boolean> => {
  try {
    return (await stat(path)).isFile();
  } catch (error) {
    if (isMissingFile(error)) return false;
    throw error;
  }
};

const discoverCardFiles = async (spaceDirectory: string): Promise<string[]> => {
  const rootFiles = await markdownFilesIn(spaceDirectory);
  let nestedFiles: string[];
  try {
    nestedFiles = await markdownFilesIn(join(spaceDirectory, 'cards'));
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
  let cardPaths: string[];
  try {
    spaceFile = await resolveSpaceFile(inputPath);
    const spaceDirectory = dirname(spaceFile);
    cardPaths = await discoverCardFiles(spaceDirectory);
  } catch (error) {
    throw new SpaceImportFileError('discovery', [String(error)]);
  }

  const readPaths = [spaceFile, ...cardPaths];
  const readResults = await Promise.allSettled(readPaths.map((path) => readFile(path, 'utf8')));
  const readDiagnostics: string[] = [];
  let spaceText: string | undefined;
  const cardTexts: string[] = [];
  readResults.forEach((result, index) => {
    if (result.status === 'rejected') {
      readDiagnostics.push(`${readPaths[index] ?? spaceFile}: ${String(result.reason)}`);
    } else if (index === 0) {
      spaceText = result.value;
    } else {
      cardTexts.push(result.value);
    }
  });

  if (readDiagnostics.length > 0 || spaceText === undefined) {
    throw new SpaceImportFileError('discovery', readDiagnostics);
  }

  const diagnostics: string[] = [];
  let parsedSpaceFile: ImportSpaceFile | undefined;
  let wrongVersion: UnsupportedVersionError | null = null;
  try {
    const json: unknown = JSON.parse(spaceText);
    // Asked before the import schema, and asked *here* rather than answered
    // here: this is the same gate domain intake reads, so the two doors a
    // document arrives by cannot come to disagree about which version this
    // build supports. The import schemas run ahead of intake, so without it a
    // version 2 directory earns the version diagnostic plus every key that
    // moved — the cascade the gate exists to prevent, arriving at the one
    // reader hand-authoring the document.
    wrongVersion = unsupportedDocumentVersion(json);
    if (wrongVersion === null) {
      const parsed = importSpaceFileSchema.safeParse(json);
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
  } catch (error) {
    diagnostics.push(`${spaceFile}: ${String(error)}`);
  }

  // One answer, and nothing behind it: a document of a version this build
  // cannot read is not a document whose cards are worth reporting either, which
  // is what intake says by answering exactly one error.
  if (wrongVersion !== null) {
    throw new SpaceImportFileError('parsing', [`${spaceFile}: ${wrongVersion.message}`]);
  }

  const cards = cardPaths.flatMap((path, index) => {
    const parsed = parseImportCardFile({ path, text: cardTexts[index] ?? '' });
    if (!parsed.ok) {
      diagnostics.push(...parsed.errors.map((error) => error.message));
      return [];
    }
    return [parsed.card];
  });

  if (diagnostics.length > 0 || parsedSpaceFile === undefined) {
    throw new SpaceImportFileError('parsing', diagnostics);
  }

  const { id, ...document } = parsedSpaceFile;
  return importSpaceSchema.parse({
    ...(id === undefined ? {} : { id }),
    document,
    cards,
  });
};

export const readImportBatch = async (inputPath: string): Promise<readonly ImportSpace[]> => {
  const absoluteInput = resolve(inputPath);
  let input;
  try {
    input = await stat(absoluteInput);
  } catch (error) {
    throw new SpaceImportFileError('discovery', [String(error)]);
  }

  let containsSpace: boolean;
  try {
    containsSpace = input.isDirectory() && (await isRegularFile(join(absoluteInput, 'space.json')));
  } catch (error) {
    throw new SpaceImportFileError('discovery', [String(error)]);
  }

  if (!input.isDirectory() || containsSpace) {
    return [await readSingleSpace(absoluteInput)];
  }

  let entries;
  try {
    entries = await readdir(absoluteInput, { withFileTypes: true });
  } catch (error) {
    throw new SpaceImportFileError('discovery', [String(error)]);
  }

  const childDirectories = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(absoluteInput, entry.name))
    .sort((left, right) =>
      compareOrdinal(relative(absoluteInput, left), relative(absoluteInput, right)),
    );
  let spaceDirectories;
  try {
    spaceDirectories = (
      await Promise.all(
        childDirectories.map(async (directory) => ({
          directory,
          containsSpace: await isRegularFile(join(directory, 'space.json')),
        })),
      )
    ).filter((candidate) => candidate.containsSpace);
  } catch (error) {
    throw new SpaceImportFileError('discovery', [String(error)]);
  }

  const results = await Promise.allSettled(
    spaceDirectories.map(({ directory }) => readSingleSpace(directory)),
  );
  const failures: unknown[] = results.flatMap((result) =>
    result.status === 'rejected' ? [result.reason as unknown] : [],
  );
  if (failures.length > 0) {
    const fileFailures = failures.filter(
      (error): error is SpaceImportFileError => error instanceof SpaceImportFileError,
    );
    if (fileFailures.length !== failures.length) throw failures[0];
    throw new SpaceImportFileError(
      fileFailures.some(({ kind }) => kind === 'discovery') ? 'discovery' : 'parsing',
      fileFailures.flatMap(({ diagnostics }) => diagnostics),
    );
  }

  return results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
};
