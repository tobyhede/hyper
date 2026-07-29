import { runHyper, type CliIo } from './run';
import type { SpaceRepository } from '../persistence/space-repository';

interface CliMainDependencies {
  repository: SpaceRepository;
  io: CliIo;
  close(): Promise<void>;
}

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const runCliMain = async (
  args: readonly string[],
  dependencies: CliMainDependencies,
): Promise<number> => {
  const exitCode = await runHyper(args, dependencies);
  try {
    await dependencies.close();
    return exitCode;
  } catch (error) {
    dependencies.io.stderr(`Database shutdown failed: ${describeError(error)}\n`);
    return 1;
  }
};
