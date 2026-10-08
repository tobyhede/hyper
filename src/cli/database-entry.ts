import type { UUID } from '@project/core';
import { DatabaseTargetConfigurationError, type DatabaseTarget } from '../database/database-target';
import { runCliMain } from './main';
import type { DatabaseCommand } from './arguments';
import type { CliIo } from './database-command';

export const runDatabaseCli = async (
  target: DatabaseTarget,
  command: DatabaseCommand,
  io: CliIo,
  newId: () => UUID,
): Promise<number> => {
  try {
    const opened = await target.open();
    return await runCliMain(command, {
      repository: opened.repository,
      io,
      newId,
      close: () => opened.close(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    io.stderr(
      error instanceof DatabaseTargetConfigurationError
        ? `${message}\n`
        : `Database open failed: ${message}\n`,
    );
    return 1;
  }
};
