import { lstat, mkdtemp, rename, rm, stat } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

export const exists = async (path: string): Promise<boolean> => {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  }
};

export const rejectSymbolicLink = async (path: string): Promise<void> => {
  try {
    if ((await lstat(path)).isSymbolicLink()) {
      throw new Error(`Export destination contains a symbolic link: ${path}`);
    }
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return;
    throw error;
  }
};

export const createStagingRoot = (destination: string): Promise<string> =>
  mkdtemp(join(dirname(destination), `.${basename(destination)}.hyper-export-`));

/**
 * Swap a fully staged replacement into place, keeping the previous destination
 * recoverable until both renames have landed.
 */
export const replaceDestination = async (
  replacement: string,
  destination: string,
): Promise<void> => {
  if (!(await exists(destination))) {
    await rename(replacement, destination);
    return;
  }

  const backupRoot = await mkdtemp(
    join(dirname(destination), `.${basename(destination)}.hyper-export-backup-`),
  );
  const backup = join(backupRoot, 'previous');
  try {
    await rename(destination, backup);
    try {
      await rename(replacement, destination);
    } catch (replacementError) {
      try {
        await rename(backup, destination);
      } catch (restoreError) {
        throw new AggregateError(
          [replacementError, restoreError],
          `Export replacement failed; the previous destination remains at ${backup}`,
          { cause: restoreError },
        );
      }
      throw replacementError;
    }
    // Both renames landed, so the export is complete and the recovery copy is
    // now housekeeping. Letting its removal fail the call would report a
    // finished export as a failure and skip `markExported`, leaving the
    // projected revision behind the bytes already on disk.
    await rm(backupRoot, { recursive: true, force: true }).catch(() => undefined);
  } catch (error) {
    if (!(await exists(backup))) await rm(backupRoot, { recursive: true, force: true });
    throw error;
  }
};
