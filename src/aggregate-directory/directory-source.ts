import type { Dirent } from 'node:fs';
import { lstat, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AggregateSource } from '@project/aggregate';
import { isMissingFile } from './space-directory';

/** How many files Import reads at once, well under a process's descriptor limit. */
const READ_CONCURRENCY = 32;

/**
 * Whether anything is at `path` itself, a link included: a link whose target
 * is missing is an entry that cannot be listed, not a directory that is absent.
 */
const isEntry = async (path: string): Promise<boolean> => {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    // Anything but its absence leaves an entry there that could not be listed.
    return !isMissingFile(error);
  }
};

/**
 * An Aggregate directory on disk as a source, `READ_CONCURRENCY` reads at a
 * time.
 *
 * A file is a regular file and a child directory a directory; a symbolic link
 * is listed as a link, whatever it names, and the reader refuses one at a path
 * Hyper owns (ADR 0134). A directory that does not exist lists empty, but one
 * that cannot be listed answers why, as does a file that cannot be read.
 */
export const directorySource = (directory: string): AggregateSource => ({
  name: directory,
  concurrency: READ_CONCURRENCY,
  list: async (inside) => {
    const path = join(directory, inside);
    try {
      const entries = await readdir(path, { withFileTypes: true });
      const named = (kind: (entry: Dirent) => boolean): string[] =>
        entries.filter(kind).map(({ name }) => name);
      return {
        ok: true,
        listing: {
          files: named((entry) => entry.isFile()),
          directories: named((entry) => entry.isDirectory()),
          links: named((entry) => entry.isSymbolicLink()),
        },
      };
    } catch (error) {
      if (isMissingFile(error) && !(await isEntry(path))) {
        return { ok: true, listing: { files: [], directories: [], links: [] } };
      }
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
