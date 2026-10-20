import type { Dirent } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  AGGREGATE_FILE_NAME,
  AggregateDirectoryError,
  compareOrdinal,
  IMAGES_DIRECTORY_NAME,
  imageFileName,
  readAggregateFiles,
  scannedAggregatePaths,
  spaceDirectoryId,
  type AggregateDirectoryContents,
} from '@project/aggregate';
import { AGGREGATE_FILE_VERSION, type AggregateFile, type UUID } from '@project/core';
import type { LoadedAggregate, StoredImage } from '@project/persistence';
import { isMissingFile } from './space-directory';
import { writeInPlace, type DirectoryFiles } from './write-in-place';
import { spaceDirectoryFiles } from './write-space-directory';

/**
 * The regular files of an Aggregate directory that Import could read, by path
 * relative to it with `/` between segments: those directly in it, those in
 * each child directory, and those in the `resources/` of each child holding a
 * `space.json`. `images/` and a `resources/` are listed through a link, as
 * Import reads them, so Export sees what a link would make it remove. Which of them Import does read is `scannedAggregatePaths`'s
 * to say; this only lists, so the one discovery rule decides for Import and
 * Export alike.
 *
 * A directory that cannot be listed is a discovery failure naming it.
 */
const listAggregateDirectory = async (directory: string): Promise<readonly string[]> => {
  const filesIn = (entries: readonly Dirent[], prefix: string): string[] =>
    entries.filter((entry) => entry.isFile()).map(({ name }) => `${prefix}${name}`);
  try {
    const root = await readdir(directory, { withFileTypes: true });
    const children = await Promise.all(
      root
        .filter((entry) => entry.isDirectory() || entry.name === IMAGES_DIRECTORY_NAME)
        .map(async ({ name }) => {
          const inside = await readdir(join(directory, name), { withFileTypes: true });
          const holdsSpace = inside.some((entry) => entry.isFile() && entry.name === 'space.json');
          const hasResources = inside.some((entry) => entry.name === 'resources');
          const resources =
            holdsSpace && hasResources
              ? filesIn(
                  await readdir(join(directory, name, 'resources'), { withFileTypes: true }),
                  `${name}/resources/`,
                )
              : [];
          return [...filesIn(inside, `${name}/`), ...resources];
        }),
    );
    return [...filesIn(root, ''), ...children.flat()];
  } catch (error) {
    throw new AggregateDirectoryError('discovery', [String(error)]);
  }
};

/** The Space directories among the paths Import reads, by name, in read order. */
const spaceDirectoryNames = (scanned: readonly string[]): readonly string[] =>
  scanned.flatMap((path) => {
    const [name, file, ...rest] = path.split('/');
    return file === 'space.json' && rest.length === 0 && name !== undefined ? [name] : [];
  });

/**
 * Read a canonical aggregate directory from disk into the complete Meta-rooted
 * input the persistence lifecycle takes, beside every image `images/` carries.
 *
 * The filesystem shell around `readAggregateFiles`, which parses, admits and
 * identifies whatever bytes it is given, wherever they came from. This reads
 * `hyper.json` and, when there is one, the files Import scans, and hands their
 * bytes over. A missing `hyper.json` is that reader's refusal; one that cannot
 * be read is a discovery failure naming it.
 */
export const readAggregate = async (
  inputPath: string,
  newId: () => UUID,
): Promise<AggregateDirectoryContents> => {
  const directory = resolve(inputPath);
  const aggregatePath = join(directory, AGGREGATE_FILE_NAME);
  let aggregateBytes: Uint8Array;
  try {
    aggregateBytes = new Uint8Array(await readFile(aggregatePath));
  } catch (error) {
    if (isMissingFile(error)) return readAggregateFiles(directory, new Map(), newId);
    throw new AggregateDirectoryError('discovery', [`${aggregatePath}: ${String(error)}`]);
  }
  const paths = scannedAggregatePaths(await listAggregateDirectory(directory)).filter(
    (path) => path !== AGGREGATE_FILE_NAME,
  );
  const reads = await Promise.allSettled(paths.map((path) => readFile(join(directory, path))));
  const files = new Map<string, Uint8Array>([[AGGREGATE_FILE_NAME, aggregateBytes]]);
  const unreadable = new Map<string, string>();
  reads.forEach((result, index) => {
    const path = paths[index];
    if (path === undefined) return;
    if (result.status === 'fulfilled') files.set(path, new Uint8Array(result.value));
    else unreadable.set(path, String(result.reason));
  });
  return readAggregateFiles(directory, files, newId, unreadable);
};

const aggregateFile = (metaSpaceId: UUID): AggregateFile => ({
  version: AGGREGATE_FILE_VERSION,
  metaSpaceId,
});

/**
 * Every file an aggregate and the stored images it shows serialise to, by path
 * relative to the Aggregate directory: `hyper.json`, each Space's directory
 * named for its id, and `images/<content-id>.<ext>` (ADR 0118).
 */
export const aggregateFiles = (
  aggregate: LoadedAggregate,
  images: readonly StoredImage[],
): DirectoryFiles => {
  const files = new Map<string, Uint8Array>([
    [
      AGGREGATE_FILE_NAME,
      Buffer.from(`${JSON.stringify(aggregateFile(aggregate.metaSpaceId), null, 2)}\n`),
    ],
  ]);
  for (const space of [...aggregate.spaces].sort((left, right) =>
    compareOrdinal(left.snapshot.id, right.snapshot.id),
  )) {
    for (const [path, text] of spaceDirectoryFiles(space)) {
      files.set(`${space.snapshot.id}/${path}`, Buffer.from(text));
    }
  }
  for (const image of images) {
    files.set(`${IMAGES_DIRECTORY_NAME}/${imageFileName(image)}`, image.bytes);
  }
  return files;
};

const directoryExists = async (path: string): Promise<boolean> => {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (isMissingFile(error)) return false;
    throw error;
  }
};

/**
 * Every file Import would read in `directory`, by path relative to it: what
 * Export owns there, and so what it removes when the aggregate no longer
 * serialises to it. `hyper.json`, each discovered Space directory's
 * `space.json` and Resource files, and the visible files in `images/` — and
 * nothing else, so a file Import does not read is never Export's to remove.
 * They are the paths `scannedAggregatePaths` keeps from the directory's
 * listing, in its order.
 */
export const scannedAggregateFiles = async (directory: string): Promise<readonly string[]> =>
  (await directoryExists(directory))
    ? scannedAggregatePaths(await listAggregateDirectory(directory))
    : [];

/**
 * Refuse a destination holding a Space directory import could not read back,
 * before anything is written.
 *
 * Import refuses a Space directory the author left here under a name that is
 * not its Space's id — an old flat-format Space, a hand-authored sample — so
 * every export into it would write a directory that cannot be imported.
 *
 * Checked here rather than answered by having the reader skip a directory it
 * cannot name: that skip is the guard which stops a renamed Space directory
 * importing as a fresh Space, and dropping it would trade a loud failure for a
 * silent duplication.
 */
export const assertExportableDestination = async (destination: string): Promise<void> => {
  if (!(await directoryExists(destination))) return;
  const unreadable = spaceDirectoryNames(await scannedAggregateFiles(destination))
    .filter((name) => spaceDirectoryId(name) === undefined)
    .map((name) => join(destination, name));
  if (unreadable.length === 0) return;
  throw new Error(
    [
      'Export destination holds a Space directory that is not named for its Space, so the export could not be read back:',
      ...unreadable,
      'Rename each to its Space id in lower case, or move it out of the destination.',
    ].join('\n'),
  );
};

/**
 * Write one Aggregate into a directory, in place: `hyper.json` plus every
 * Space directory, removing the Space directories and Resource files Import
 * would read that the Aggregate no longer holds. Nothing is checked before
 * writing; `exportAggregate` is the write that checks.
 */
export const writeAggregateDirectory = async (
  aggregate: LoadedAggregate,
  directory: string,
): Promise<void> => {
  const owned = (await scannedAggregateFiles(directory)).filter(
    (path) => !path.startsWith(`${IMAGES_DIRECTORY_NAME}/`),
  );
  const files = aggregateFiles(aggregate, []);
  await writeInPlace(directory, files, owned);
};
