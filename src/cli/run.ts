import { importSingleSpace, SingleSpaceImportError } from '../import/import-single-space';
import { SpaceImportFileError } from '../import/read-single-space';
import type { SpaceRepository } from '../persistence/space-repository';

export interface CliIo {
  stdout(message: string): void;
  stderr(message: string): void;
}

interface RunHyperDependencies {
  repository: SpaceRepository;
  io: CliIo;
}

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const reportImportError = (error: unknown, io: CliIo): void => {
  if (error instanceof SpaceImportFileError) {
    const label = error.kind === 'discovery' ? 'File discovery failed' : 'File parsing failed';
    io.stderr(`${label}:\n${error.diagnostics.join('\n')}\n`);
    return;
  }

  if (error instanceof SingleSpaceImportError) {
    const labels = {
      identity: 'Identity import failed',
      'domain-validation': 'Domain validation failed',
      'revision-conflict': 'Revision conflict',
    } as const;
    io.stderr(`${labels[error.kind]}: ${error.message}\n`);
    return;
  }

  io.stderr(`Database import failed: ${describeError(error)}\n`);
};

export const runHyper = async (
  args: readonly string[],
  dependencies: RunHyperDependencies,
): Promise<number> => {
  const path = args[0];
  if (path === undefined || args.length !== 1) {
    dependencies.io.stderr('Usage: hyper <space.json-or-directory>\n');
    return 2;
  }

  try {
    const stored = await importSingleSpace(path, dependencies.repository);
    dependencies.io.stdout(
      `Imported space ${stored.snapshot.id} at revision ${stored.revision.toString()}\n`,
    );
    return 0;
  } catch (error) {
    reportImportError(error, dependencies.io);
    return 1;
  }
};
