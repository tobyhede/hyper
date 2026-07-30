import { importSpaceBatch, SingleSpaceImportError } from '../import/import-single-space';
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
  const truncateArguments = args.filter((argument) => argument === '--dangerous-truncate');
  const paths = args.filter((argument) => argument !== '--dangerous-truncate');
  const path = paths[0];
  if (
    path === undefined ||
    paths.length !== 1 ||
    truncateArguments.length > 1 ||
    args.some((argument) => argument.startsWith('--') && argument !== '--dangerous-truncate')
  ) {
    dependencies.io.stderr('Usage: hyper <path> [--dangerous-truncate]\n');
    return 2;
  }

  try {
    const mode = truncateArguments.length === 1 ? 'truncate' : 'upsert';
    const stored = await importSpaceBatch(path, dependencies.repository, mode);
    if (stored.length === 1) {
      const [space] = stored;
      if (space === undefined) throw new Error('One-space import returned no space');
      dependencies.io.stdout(
        `Imported space ${space.snapshot.id} at revision ${space.revision.toString()}\n`,
      );
    } else {
      dependencies.io.stdout(
        `Imported ${stored.length} spaces:\n${stored
          .map((space) => `${space.snapshot.id} at revision ${space.revision.toString()}`)
          .join('\n')}\n`,
      );
    }
    return 0;
  } catch (error) {
    reportImportError(error, dependencies.io);
    return 1;
  }
};
