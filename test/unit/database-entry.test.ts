import { describe, expect, it, vi } from 'vitest';
import { newUuid } from '@project/core';
import { runDatabaseCli } from '../../src/cli/database-entry';
import {
  DatabaseTargetConfigurationError,
  type DatabaseTarget,
} from '../../src/database/database-target';
import { MemorySpaceRepository } from '../support/memory-space-repository';

describe('database CLI entry', () => {
  it('opens and closes the selected target around one command', async () => {
    const close = vi.fn(() => Promise.resolve());
    const target: DatabaseTarget = {
      open: () => Promise.resolve({ repository: new MemorySpaceRepository(), close }),
    };
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runDatabaseCli(target, ['--unknown'], { stdout, stderr }, newUuid)).resolves.toBe(
      2,
    );
    expect(close).toHaveBeenCalledOnce();
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('Usage: hyper'));
  });

  it('reports a target that cannot open without running a command', async () => {
    const target: DatabaseTarget = {
      open: () => Promise.reject(new Error('unavailable target')),
    };
    const stderr = vi.fn();

    await expect(runDatabaseCli(target, [], { stdout: vi.fn(), stderr }, newUuid)).resolves.toBe(1);
    expect(stderr).toHaveBeenCalledWith('Database open failed: unavailable target\n');
  });

  it('reports a complete target configuration diagnostic without decorating it', async () => {
    const target: DatabaseTarget = {
      open: () => Promise.reject(new DatabaseTargetConfigurationError('name the database')),
    };
    const stderr = vi.fn();

    await expect(runDatabaseCli(target, [], { stdout: vi.fn(), stderr }, newUuid)).resolves.toBe(1);
    expect(stderr).toHaveBeenCalledWith('name the database\n');
  });
});
