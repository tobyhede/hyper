import type { Dirent } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { IMAGES_DIRECTORY_NAME, type AggregateSource } from '@project/aggregate';
import { isMissingFile } from './space-directory';

/** How many files Import reads at once, well under a process's descriptor limit. */
const READ_CONCURRENCY = 32;

/**
 * Whether a directory entry is a file Import could read: a regular file, or,
 * where `followLinks`, a symbolic link whose target is one. A link that names
 * nothing is no file.
 */
const isListedFile = async (
  directory: string,
  entry: Dirent,
  followLinks: boolean,
): Promise<boolean> => {
  if (entry.isFile()) return true;
  if (!followLinks || !entry.isSymbolicLink()) return false;
  try {
    return (await stat(join(directory, entry.name))).isFile();
  } catch (error) {
    if (isMissingFile(error)) return false;
    throw error;
  }
};

/**
 * An Aggregate directory on disk as a source, `READ_CONCURRENCY` reads at a
 * time.
 *
 * A file is a regular file or a link to one, since Import reads through a
 * link, so a linked `hyper.json`, `space.json` or Resource file is read and
 * owned like the file it names. In `images/` a file is a regular file only: a
 * link there is the author's, neither admitted nor removed. A child directory
 * is a directory and not a link to one, but a directory is listed through a
 * link, so the `images/` and the `resources/` the reader asks for are listed
 * as Import reads them and Export sees what a link would make it remove.
 *
 * A directory that does not exist lists empty. One that cannot be listed, or
 * holds a link whose target cannot be checked for any reason but its absence,
 * answers why, as does a file that cannot be read.
 */
export const directorySource = (directory: string): AggregateSource => ({
  name: directory,
  concurrency: READ_CONCURRENCY,
  list: async (inside) => {
    const path = join(directory, inside);
    try {
      const entries = await readdir(path, { withFileTypes: true });
      const followLinks = inside !== IMAGES_DIRECTORY_NAME;
      const listed = await Promise.all(
        entries.map((entry) => isListedFile(path, entry, followLinks)),
      );
      return {
        ok: true,
        listing: {
          files: entries.filter((_, index) => listed[index]).map(({ name }) => name),
          directories: entries.filter((entry) => entry.isDirectory()).map(({ name }) => name),
        },
      };
    } catch (error) {
      if (isMissingFile(error)) return { ok: true, listing: { files: [], directories: [] } };
      return { ok: false, reason: String(error) };
    }
  },
  read: async (path) => {
    try {
      return { ok: true, bytes: new Uint8Array(await readFile(join(directory, path))) };
    } catch (error) {
      return { ok: false, reason: String(error) };
    }
  },
});
