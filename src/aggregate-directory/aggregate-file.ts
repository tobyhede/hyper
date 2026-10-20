import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import {
  AGGREGATE_FILE_NAME,
  AggregateDirectoryError,
  compareOrdinal,
  IMAGES_DIRECTORY_NAME,
  imageFileName,
  readAggregateFiles,
  spaceDirectoryId,
  type AggregateDirectoryContents,
} from '@project/aggregate';
import { AGGREGATE_FILE_VERSION, type AggregateFile, type UUID } from '@project/core';
import type { LoadedAggregate, StoredImage } from '@project/persistence';
import { scannedImageFileNames } from './images';
import { isMissingFile } from './space-directory';
import { writeInPlace, type DirectoryFiles } from './write-in-place';
import { scannedSpaceFiles, spaceDirectoryFiles } from './write-space-directory';

const isRegularFile = async (path: string): Promise<boolean> => {
  try {
    return (await stat(path)).isFile();
  } catch (error) {
    if (isMissingFile(error)) return false;
    throw error;
  }
};

/**
 * The immediate children that are Space directories, in ordinal name order.
 *
 * A child is a Space directory because it holds a `space.json` — the same rule
 * a single Space directory is recognised by, and the one
 * `scannedAggregatePaths` applies to a list of paths. A child that holds none
 * is not an error: re-export preserves whatever else the destination carried,
 * so a directory of notes beside the Spaces has to survive a round trip rather
 * than fail one.
 *
 * Ordinal order, not the host's collation, for the reason `space-directory`
 * sorts that way: import order decides the order Spaces are written and read
 * back, so it has to come from the bytes rather than from ICU.
 *
 * Private to this module: export reaches discovery only through
 * `assertExportableDestination` and `scannedAggregateFiles`, so a second
 * discovery rule cannot drift beside the write path.
 */
const discoverSpaceDirectories = async (directory: string): Promise<string[]> => {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    throw new AggregateDirectoryError('discovery', [String(error)]);
  }

  const children = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(directory, entry.name))
    .sort((left, right) => compareOrdinal(basename(left), basename(right)));

  try {
    const candidates = await Promise.all(
      children.map(async (child) => ({
        child,
        containsSpace: await isRegularFile(join(child, 'space.json')),
      })),
    );
    return candidates.flatMap(({ child, containsSpace }) => (containsSpace ? [child] : []));
  } catch (error) {
    throw new AggregateDirectoryError('discovery', [String(error)]);
  }
};

/**
 * The bytes of every file Import reads in an Aggregate directory beside
 * `hyper.json`, by path relative to it: each discovered Space directory's
 * `space.json` and Resource files, and the visible files in `images/`.
 *
 * A Space directory whose files cannot be listed, or a file that cannot be
 * read, is a discovery failure naming it. Every one is gathered before any is
 * raised, so one unreadable Space does not hide the next one's problem.
 */
const readScannedFiles = async (directory: string): Promise<DirectoryFiles> => {
  const spaceDirectories = await discoverSpaceDirectories(directory);
  const [listed, imageNames] = await Promise.all([
    Promise.allSettled(
      spaceDirectories.map(async (child) =>
        (await scannedSpaceFiles(child)).map((path) => `${basename(child)}/${path}`),
      ),
    ),
    scannedImageFileNames(directory),
  ]);
  const paths = [
    ...listed.flatMap((result) => (result.status === 'fulfilled' ? result.value : [])),
    ...imageNames.map((name) => `${IMAGES_DIRECTORY_NAME}/${name}`),
  ];
  const reads = await Promise.allSettled(paths.map((path) => readFile(join(directory, path))));

  const diagnostics = listed.flatMap((result) =>
    result.status === 'rejected' ? [String(result.reason)] : [],
  );
  const files = new Map<string, Uint8Array>();
  reads.forEach((result, index) => {
    const path = paths[index];
    if (path === undefined) return;
    if (result.status === 'fulfilled') files.set(path, new Uint8Array(result.value));
    else diagnostics.push(`${join(directory, path)}: ${String(result.reason)}`);
  });
  if (diagnostics.length > 0) throw new AggregateDirectoryError('discovery', diagnostics);
  return files;
};

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
  const files = new Map(await readScannedFiles(directory));
  files.set(AGGREGATE_FILE_NAME, aggregateBytes);
  return readAggregateFiles(directory, files, newId);
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
 * They are the paths `scannedAggregatePaths` keeps from the directory's files,
 * in its order (`test/unit/read-aggregate.test.ts`).
 */
export const scannedAggregateFiles = async (directory: string): Promise<readonly string[]> => {
  if (!(await directoryExists(directory))) return [];
  const aggregate = (await isRegularFile(join(directory, AGGREGATE_FILE_NAME)))
    ? [AGGREGATE_FILE_NAME]
    : [];
  const spaces = await Promise.all(
    (await discoverSpaceDirectories(directory)).map(async (child) =>
      (await scannedSpaceFiles(child)).map((path) => `${basename(child)}/${path}`),
    ),
  );
  const images = (await scannedImageFileNames(directory)).map(
    (name) => `${IMAGES_DIRECTORY_NAME}/${name}`,
  );
  return [...aggregate, ...spaces.flat(), ...images];
};

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
  const unreadable = (await discoverSpaceDirectories(destination)).filter(
    (child) => spaceDirectoryId(basename(child)) === undefined,
  );
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
