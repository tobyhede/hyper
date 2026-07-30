import { importSpaceBatch, SpaceImportError } from '../import/import-space';
import { SpaceImportFileError } from '../import/read-single-space';
import type { SpaceRepository } from '../persistence/space-repository';
import { resolveDatabaseStartup, type DatabaseStartupResult } from '../startup/database-startup';

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

  if (error instanceof SpaceImportError) {
    const labels = {
      identity: 'Identity import failed',
      'domain-validation': 'Domain validation failed',
    } as const;
    io.stderr(`${labels[error.kind]}: ${error.message}\n`);
    return;
  }

  io.stderr(`Database import failed: ${describeError(error)}\n`);
};

const reportStartup = (startup: DatabaseStartupResult, io: CliIo): void => {
  if (startup.kind === 'opened') {
    io.stdout(
      `Opened space ${startup.space.snapshot.id} at revision ${startup.space.revision.toString()}\n`,
    );
    return;
  }

  io.stdout(
    `Choose a space:\n${startup.spaces.map((space) => `${space.title} (${space.id})`).join('\n')}\n`,
  );
};

export const runHyper = async (
  args: readonly string[],
  dependencies: RunHyperDependencies,
): Promise<number> => {
  const truncateArguments = args.filter((argument) => argument === '--dangerous-truncate');
  const paths = args.filter((argument) => argument !== '--dangerous-truncate');
  const path = paths[0];
  if (
    paths.length > 1 ||
    (path === undefined && truncateArguments.length > 0) ||
    truncateArguments.length > 1 ||
    args.some((argument) => argument.startsWith('--') && argument !== '--dangerous-truncate')
  ) {
    dependencies.io.stderr('Usage: hyper [<path>] [--dangerous-truncate]\n');
    return 2;
  }

  if (path === undefined) {
    try {
      const startup = await resolveDatabaseStartup(dependencies.repository);
      reportStartup(startup, dependencies.io);
      return 0;
    } catch (error) {
      dependencies.io.stderr(`Database startup failed: ${describeError(error)}\n`);
      return 1;
    }
  }

  let stored;
  try {
    const mode = truncateArguments.length === 1 ? 'truncate' : 'insert';
    stored = await importSpaceBatch(path, dependencies.repository, mode);
  } catch (error) {
    reportImportError(error, dependencies.io);
    return 1;
  }

  try {
    const startup = await resolveDatabaseStartup(dependencies.repository, stored);
    reportStartup(startup, dependencies.io);
    return 0;
  } catch (error) {
    dependencies.io.stderr(`Database startup failed: ${describeError(error)}\n`);
    return 1;
  }
};
