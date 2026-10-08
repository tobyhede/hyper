import { describeError } from './describe-error';
import { DatabaseTargetConfigurationError, type DatabaseTarget } from '../database/database-target';
import type { DatabaseCommand } from './arguments';
import { runDatabaseCommand, type DatabaseCommandDependencies } from './database-command';
import type { CliIo } from './io';

const tryReport = (io: CliIo, message: string): void => {
  try {
    io.stderr(message);
  } catch {
    // A broken stderr must not prevent database cleanup or change the exit code.
  }
};

/**
 * Open the target, run one command over it and close it, answering the exit
 * code. Each phase has its own diagnostic, and a target that opened is closed
 * however the command ends.
 */
export const runDatabaseCli = async (
  target: DatabaseTarget,
  command: DatabaseCommand,
  { io, newId }: Omit<DatabaseCommandDependencies, 'repository'>,
): Promise<number> => {
  let opened;
  try {
    opened = await target.open();
  } catch (error) {
    const message = describeError(error);
    io.stderr(
      error instanceof DatabaseTargetConfigurationError
        ? `${message}\n`
        : `Database open failed: ${message}\n`,
    );
    return 1;
  }

  let exitCode: number;
  try {
    exitCode = await runDatabaseCommand(command, { repository: opened.repository, io, newId });
  } catch (error) {
    tryReport(io, `Command failed: ${describeError(error)}\n`);
    exitCode = 1;
  }

  try {
    await opened.close();
    return exitCode;
  } catch (error) {
    tryReport(io, `Database shutdown failed: ${describeError(error)}\n`);
    return 1;
  }
};
