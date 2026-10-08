import { describe, expect, it, vi } from 'vitest';
import { newUuid } from '@project/core';
import type { DatabaseCommand } from '../../src/cli/arguments';
import { runDatabaseCli } from '../../src/cli/database-entry';
import {
  DatabaseTargetConfigurationError,
  type DatabaseTarget,
} from '../../src/database/database-target';
import { MemorySpaceRepository } from '../../src/persistence/memory-space-repository';

const exportCommand: DatabaseCommand = {
  verb: 'export',
  directory: 'destination',
  store: 'postgres',
};

describe('database CLI entry', () => {
  it('opens and closes the selected target around one command', async () => {
    const close = vi.fn(() => Promise.resolve());
    const target: DatabaseTarget = {
      open: () => Promise.resolve({ repository: new MemorySpaceRepository(), close }),
    };
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(
      runDatabaseCli(target, exportCommand, { io: { stdout, stderr }, newId: newUuid }),
    ).resolves.toBe(1);
    expect(close).toHaveBeenCalledOnce();
    expect(stderr).toHaveBeenCalledWith(
      'The repository is not initialized, so there is no aggregate to export\n',
    );
  });

  it('reports a target that cannot open without running a command', async () => {
    const target: DatabaseTarget = {
      open: () => Promise.reject(new Error('unavailable target')),
    };
    const stderr = vi.fn();

    await expect(
      runDatabaseCli(target, exportCommand, { io: { stdout: vi.fn(), stderr }, newId: newUuid }),
    ).resolves.toBe(1);
    expect(stderr).toHaveBeenCalledWith('Database open failed: unavailable target\n');
  });

  it('reports a complete target configuration diagnostic without decorating it', async () => {
    const target: DatabaseTarget = {
      open: () => Promise.reject(new DatabaseTargetConfigurationError('name the database')),
    };
    const stderr = vi.fn();

    await expect(
      runDatabaseCli(target, exportCommand, { io: { stdout: vi.fn(), stderr }, newId: newUuid }),
    ).resolves.toBe(1);
    expect(stderr).toHaveBeenCalledWith('name the database\n');
  });
});
