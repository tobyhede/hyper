import { describe, expect, it, vi } from 'vitest';
import { newUuid } from '@project/core';
import { runDatabaseCli } from '../../src/cli/database-entry';
import type { DatabaseTarget } from '../../src/database/database-target';
import type { SpaceRepository } from '../../src/persistence/space-repository';

/**
 * Opening the target and running the command are two phases with two
 * diagnostics, and the target the first phase opened is closed however the
 * second one ends.
 *
 * `runDatabaseCli` awaits `runCliMain` inside the same `try` that guards
 * `target.open()`, which reads as though a command failure would be reported as
 * an open failure with the database left open. It is not: `runCliMain` catches
 * every failure out of `runHyper` as `Command failed:` and awaits `close()`
 * afterwards either way, so the only rejection that `try` ever sees is
 * `target.open()`'s. These tests hold that arrangement, because the two
 * modules are the ones that have to agree and neither says so alone.
 */

const rejectingRepository = (error: Error): SpaceRepository => ({
  listSpaces: () => Promise.reject(error),
  loadSpace: () => Promise.reject(error),
  loadAggregate: () => Promise.reject(error),
  commit: () => Promise.reject(error),
  initializeAggregate: () => Promise.reject(error),
  loadMetaSpaceId: () => Promise.reject(error),
  replaceAggregate: () => Promise.reject(error),
  markExported: () => Promise.reject(error),
});

const openingTarget = (
  repository: SpaceRepository,
  close: () => Promise<void>,
): DatabaseTarget => ({
  open: () => Promise.resolve({ repository, close }),
});

describe('database CLI entry phases', () => {
  it('reports a failing command as a command failure rather than a failure to open', async () => {
    const close = vi.fn(() => Promise.resolve());
    const stderr = vi.fn();

    await expect(
      runDatabaseCli(
        openingTarget(rejectingRepository(new Error('driver exploded')), close),
        ['export', 'destination'],
        { stdout: vi.fn(), stderr },
        newUuid,
      ),
    ).resolves.toBe(1);

    expect(stderr).toHaveBeenCalledWith('Export failed: driver exploded\n');
    expect(close).toHaveBeenCalledOnce();
  });

  it('closes the opened target when the command itself rejects', async () => {
    const close = vi.fn(() => Promise.resolve());
    const reported: string[] = [];
    let pending = true;
    // The usage path's only step is the `stderr` write, so a write that throws
    // makes the command phase reject rather than return an exit code.
    const stderr = (message: string): void => {
      if (pending) {
        pending = false;
        throw new Error('stderr exploded');
      }
      reported.push(message);
    };

    await expect(
      runDatabaseCli(
        openingTarget(rejectingRepository(new Error('unreached')), close),
        ['--unknown'],
        { stdout: vi.fn(), stderr },
        newUuid,
      ),
    ).resolves.toBe(1);

    expect(reported).toEqual(['Command failed: stderr exploded\n']);
    expect(close).toHaveBeenCalledOnce();
  });

  it('reports a target that cannot open without opening anything to close', async () => {
    const stderr = vi.fn();
    const target: DatabaseTarget = { open: () => Promise.reject(new Error('unavailable target')) };

    await expect(
      runDatabaseCli(target, ['export', 'destination'], { stdout: vi.fn(), stderr }, newUuid),
    ).resolves.toBe(1);

    expect(stderr).toHaveBeenCalledWith('Database open failed: unavailable target\n');
  });
});
