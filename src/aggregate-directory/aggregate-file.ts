import { join, resolve } from 'node:path';
import {
  AGGREGATE_FILE_NAME,
  compareOrdinal,
  IMAGES_DIRECTORY_NAME,
  imageFileName,
  readAggregateFrom,
  scanAggregateFrom,
  spaceDirectoryId,
  type AggregateDirectoryContents,
} from '@project/aggregate';
import { AGGREGATE_FILE_VERSION, type AggregateFile, type UUID } from '@project/core';
import type { LoadedAggregate, StoredImage } from '@project/persistence';
import { directorySource } from './directory-source';
import { writeInPlace, type DirectoryFiles } from './write-in-place';
import { spaceDirectoryFiles } from './write-space-directory';

/**
 * Read a canonical aggregate directory from disk into the complete Meta-rooted
 * input the persistence lifecycle takes, beside every image `images/` carries:
 * `readAggregateFrom` over the directory as a `directorySource`.
 */
export const readAggregate = (
  inputPath: string,
  newId: () => UUID,
): Promise<AggregateDirectoryContents> =>
  readAggregateFrom(directorySource(resolve(inputPath)), newId);

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

/**
 * Every file Import would read in `directory`, by path relative to it: what
 * Export owns there, and so what it removes when the aggregate no longer
 * serialises to it. `hyper.json`, each discovered Space directory's
 * `space.json` and Resource files, and the visible files in `images/` — and
 * nothing else, so a file Import does not read is never Export's to remove.
 * They are the files `scanAggregateFrom` finds there, in its order, and a
 * directory that does not exist holds none.
 */
export const scannedAggregateFiles = async (directory: string): Promise<readonly string[]> =>
  (await scanAggregateFrom(directorySource(directory))).files;

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
  const { spaceDirectories } = await scanAggregateFrom(directorySource(destination));
  const unreadable = spaceDirectories
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
