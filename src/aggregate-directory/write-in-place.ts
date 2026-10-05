import { lstat, mkdir, readFile, rename, rm, rmdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { compareOrdinal } from '../ordinal';
import { isMissingFile } from './space-directory';

/**
 * The files a directory should hold, by path relative to it with `/` between
 * segments, each with its bytes.
 */
export type DirectoryFiles = ReadonlyMap<string, Uint8Array>;

const rejectSymbolicLink = async (path: string): Promise<void> => {
  try {
    if ((await lstat(path)).isSymbolicLink()) {
      throw new Error(`Export destination contains a symbolic link: ${path}`);
    }
  } catch (error) {
    if (isMissingFile(error)) return;
    throw error;
  }
};

/**
 * Refuse to write through a symbolic link: the directory itself, any file it
 * should hold, or any directory between the two. Writing through one would
 * change files outside the directory, which nothing here owns.
 */
export const rejectSymbolicLinks = async (
  directory: string,
  paths: Iterable<string>,
): Promise<void> => {
  const checked = new Set<string>([directory]);
  for (const path of paths) {
    let current = join(directory, path);
    while (current !== directory && !checked.has(current)) {
      checked.add(current);
      current = dirname(current);
    }
  }
  for (const path of checked) await rejectSymbolicLink(path);
};

const holdsBytes = async (path: string, bytes: Uint8Array): Promise<boolean> => {
  try {
    return Buffer.compare(await readFile(path), bytes) === 0;
  } catch (error) {
    if (isMissingFile(error)) return false;
    throw error;
  }
};

/**
 * Replace one file through a temporary file beside it, so a reader never sees
 * it half-written. The temporary name is dot-prefixed and ends in neither `.md`
 * nor `.json`, so Import reads nothing a failed write leaves behind.
 */
const replaceFile = async (path: string, bytes: Uint8Array): Promise<void> => {
  const temporary = join(dirname(path), `.${basename(path)}.hyper-write`);
  try {
    await writeFile(temporary, bytes);
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
};

/** Remove `from` and each directory above it, short of `directory`, while each is empty. */
const removeEmptyDirectories = async (directory: string, from: string): Promise<void> => {
  let current = from;
  while (current !== directory && current.startsWith(directory)) {
    try {
      await rmdir(current);
    } catch (error) {
      // Not empty (`EEXIST` on some platforms), or already gone: stop here.
      if (
        error instanceof Error &&
        'code' in error &&
        (error.code === 'ENOTEMPTY' || error.code === 'EEXIST' || error.code === 'ENOENT')
      ) {
        return;
      }
      throw error;
    }
    current = dirname(current);
  }
};

/**
 * Make `directory` hold `files`, in place.
 *
 * Neither `directory` nor any directory inside it is renamed or recreated, so
 * a shell or watcher inside one stays valid. A file whose bytes already match
 * is not touched. Every other file is replaced by its own rename, which is the
 * only atomicity there is: a failure part-way leaves some files new and some
 * old, and git is what restores them (ADR 0119).
 *
 * `owned` names the files the caller owns now. Each one `files` does not name
 * is removed, then every directory that removal leaves empty. Nothing outside
 * `files` and `owned` is read or touched.
 */
export const writeInPlace = async (
  directory: string,
  files: DirectoryFiles,
  owned: Iterable<string>,
): Promise<void> => {
  await mkdir(directory, { recursive: true });
  for (const path of [...files.keys()].sort(compareOrdinal)) {
    const bytes = files.get(path);
    const target = join(directory, path);
    if (bytes === undefined || (await holdsBytes(target, bytes))) continue;
    await mkdir(dirname(target), { recursive: true });
    await replaceFile(target, bytes);
  }
  const obsolete = [...owned].filter((path) => !files.has(path)).sort(compareOrdinal);
  for (const path of obsolete) {
    const target = join(directory, path);
    await rm(target, { force: true });
    await removeEmptyDirectories(directory, dirname(target));
  }
};
