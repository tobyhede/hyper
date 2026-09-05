import type { UUID } from '@project/core';
import { runHyper, type CliIo } from './run';
import type { SpaceRepository } from '../persistence/space-repository';

interface CliMainDependencies {
  repository: SpaceRepository;
  io: CliIo;
  newId: () => UUID;
  close(): Promise<void>;
}

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const tryReport = (io: CliIo, message: string): void => {
  try {
    io.stderr(message);
  } catch {
    // A broken stderr must not prevent database cleanup or change the exit code.
  }
};

export const runCliMain = async (
  args: readonly string[],
  dependencies: CliMainDependencies,
): Promise<number> => {
  let exitCode: number;
  try {
    exitCode = await runHyper(args, dependencies);
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
