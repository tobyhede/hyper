import { importSpaceBatch, SpaceImportError } from '../import/import-space';
import { SpaceImportFileError } from '../import/read-single-space';
import { uuidSchema, type UUID } from '@project/core';
import { exportSpace } from '../export/export-space';
import type { SpaceRepository } from '../persistence/space-repository';
import { resolveDatabaseStartup, type DatabaseStartupResult } from '../startup/database-startup';

export interface CliIo {
  stdout(message: string): void;
  stderr(message: string): void;
}

interface RunHyperDependencies {
  repository: SpaceRepository;
  io: CliIo;
  /**
   * The composition-owned identity source (ADR 0016). Startup mints the Meta
   * Space's own identity and those of its Default Content through it.
   */
  newId: () => UUID;
}

const USAGE =
  'Usage: hyper [<path>] [--dangerous-truncate]\n       hyper export <space-uuid> <destination-directory>\n';

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
  io.stdout(
    `Opened space ${startup.space.snapshot.id} at revision ${startup.space.revision.toString()}\n`,
  );
};

export const runHyper = async (
  args: readonly string[],
  dependencies: RunHyperDependencies,
): Promise<number> => {
  if (args[0] === 'export') {
    const rawId = args[1];
    const destination = args[2];
    if (args.length !== 3 || rawId === undefined || destination === undefined) {
      dependencies.io.stderr(USAGE);
      return 2;
    }
    const id = uuidSchema.safeParse(rawId);
    if (!id.success) {
      dependencies.io.stderr(`Invalid space UUID: ${rawId}\n`);
      return 2;
    }
    try {
      const stored = await exportSpace(dependencies.repository, id.data, destination);
      if (stored === undefined) {
        dependencies.io.stderr(`Space ${id.data} does not exist\n`);
        return 1;
      }
      dependencies.io.stdout(
        `Exported space ${id.data} at revision ${stored.revision.toString()} to ${destination}\n`,
      );
      return 0;
    } catch (error) {
      dependencies.io.stderr(`Export failed: ${describeError(error)}\n`);
      return 1;
    }
  }

  const truncateArguments = args.filter((argument) => argument === '--dangerous-truncate');
  const paths = args.filter((argument) => argument !== '--dangerous-truncate');
  const path = paths[0];
  if (
    paths.length > 1 ||
    (path === undefined && truncateArguments.length > 0) ||
    truncateArguments.length > 1 ||
    args.some((argument) => argument.startsWith('--') && argument !== '--dangerous-truncate')
  ) {
    dependencies.io.stderr(USAGE);
    return 2;
  }

  if (path === undefined) {
    try {
      const startup = await resolveDatabaseStartup(dependencies.repository, dependencies.newId);
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

  for (const space of stored) {
    dependencies.io.stdout(
      `Imported space ${space.snapshot.id} at revision ${space.revision.toString()}\n`,
    );
  }
  return 0;
};
