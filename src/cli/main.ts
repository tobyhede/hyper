import type { DatabaseCommand } from './arguments';
import { describeError } from './describe-error';
import {
  runDatabaseCommand,
  type CliIo,
  type DatabaseCommandDependencies,
} from './database-command';

interface CliMainDependencies extends DatabaseCommandDependencies {
  close(): Promise<void>;
}

const tryReport = (io: CliIo, message: string): void => {
  try {
    io.stderr(message);
  } catch {
    // A broken stderr must not prevent database cleanup or change the exit code.
  }
};

export const runCliMain = async (
  command: DatabaseCommand,
  dependencies: CliMainDependencies,
): Promise<number> => {
  let exitCode: number;
  try {
    exitCode = await runDatabaseCommand(command, dependencies);
  } catch (error) {
    tryReport(dependencies.io, `Command failed: ${describeError(error)}\n`);
    exitCode = 1;
  }

  try {
    await dependencies.close();
    return exitCode;
  } catch (error) {
    tryReport(dependencies.io, `Database shutdown failed: ${describeError(error)}\n`);
    return 1;
  }
};
