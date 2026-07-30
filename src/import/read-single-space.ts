import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import {
  importSpaceFileSchema,
  importSpaceSchema,
  type ImportSpace,
  type ImportSpaceFile,
} from '@project/core';
import { parseImportCardFile } from '@project/graph';

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

const markdownFilesIn = async (directory: string): Promise<string[]> =>
  (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => join(directory, entry.name));

const isMissingFile = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && error.code === 'ENOENT';

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
    relative(spaceDirectory, left).localeCompare(relative(spaceDirectory, right)),
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
  try {
    const json: unknown = JSON.parse(spaceText);
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
  } catch (error) {
    diagnostics.push(`${spaceFile}: ${String(error)}`);
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
