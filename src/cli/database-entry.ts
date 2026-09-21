import type { UUID } from '@project/core';
import { DatabaseTargetConfigurationError, type DatabaseTarget } from '../database/database-target';
import { runCliMain } from './main';
import type { CliIo } from './run';

export const runDatabaseCli = async (
  target: DatabaseTarget,
  args: readonly string[],
  io: CliIo,
  newId: () => UUID,
): Promise<number> => {
  try {
    const opened = await target.open();
    return await runCliMain(args, {
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
