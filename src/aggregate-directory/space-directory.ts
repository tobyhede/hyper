import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import type { ImportSpace } from '@project/core';
import {
  AggregateDirectoryError,
  compareOrdinal,
  parseSingleSpace,
  refuseSpaceDocument,
} from '@project/aggregate';

const resolveSpaceFile = async (inputPath: string): Promise<string> => {
  const absoluteInput = resolve(inputPath);
  return (await stat(absoluteInput)).isDirectory()
    ? join(absoluteInput, 'space.json')
    : absoluteInput;
};

const filesIn = async (directory: string, extensions: readonly string[]): Promise<string[]> =>
  (await readdir(directory, { withFileTypes: true }))
    .filter(
      (entry) => entry.isFile() && extensions.some((extension) => entry.name.endsWith(extension)),
    )
    .map((entry) => join(directory, entry.name));

/**
 * Shared by the filesystem readers, which face the same question about the
 * same kind of value: each has to tell "this file is not there" from every
 * other reason a read failed, and a second copy of the test is a second place
 * for it to drift.
 */
export const isMissingFile = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && error.code === 'ENOENT';

/**
 * The files Import reads in a Space directory, in ordinal order of their
 * relative paths: `resources/*.json`, the Resource files, and every
 * `.md` in `resources/` or beside `space.json`. A `.md` is read so that one no
 * Resource file names as its sidecar is refused, naming it, rather than
 * ignored: a Resource written in an older format is never silently dropped.
 * Export removes exactly these when a Resource leaves, so the two cannot drift.
 */
export const discoverResourceFiles = async (spaceDirectory: string): Promise<string[]> => {
  const rootFiles = await filesIn(spaceDirectory, ['.md']);
  let nestedFiles: string[];
  try {
    nestedFiles = await filesIn(join(spaceDirectory, 'resources'), ['.json', '.md']);
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
    refuseSpaceDocument(spaceFile, spaceText);
    throw new AggregateDirectoryError('discovery', readDiagnostics);
  }
  return parseSingleSpace({ spaceFile, spaceText, resources });
};
