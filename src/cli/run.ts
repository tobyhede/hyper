import type { UUID } from '@project/core';
import { describeAggregateRefusal } from './aggregate-refusal';
import { exportAggregate } from '../export/export-aggregate';
import { importAggregate, type AggregateImportResult } from '../import/import-aggregate';
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
  /**
   * The composition-owned identity source (ADR 0016). Startup mints the Meta
   * Space's own identity and those of its Default Content through it, and
   * import mints the nested ids a hand-authored aggregate leaves out.
   */
  newId: () => UUID;
}

const USAGE =
  'Usage: hyper [<aggregate-path>] [--dangerous-truncate]\n       hyper export <destination-directory>\n';

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const reportImportFileError = (error: unknown, io: CliIo): void => {
  if (error instanceof SpaceImportFileError) {
    const label = error.kind === 'discovery' ? 'File discovery failed' : 'File parsing failed';
    io.stderr(`${label}:\n${error.diagnostics.join('\n')}\n`);
    return;
  }

  io.stderr(`Database import failed: ${describeError(error)}\n`);
};

/**
 * Turn an import outcome into an exit code and a sentence.
 *
 * Every refusal names what the repository currently holds, because the operator's
 * next move differs by outcome: an initialized repository needs
 * `--dangerous-truncate`, a conflict needs the command run again, and a refused
 * aggregate needs the directory fixed.
 */
const reportImportResult = (result: AggregateImportResult, io: CliIo): number => {
  switch (result.kind) {
    case 'imported': {
      io.stdout('Imported the aggregate\n');
      for (const space of result.spaces) {
        io.stdout(`Imported space ${space.snapshot.id} at revision ${space.revision.toString()}\n`);
      }
      return 0;
    }
    // Nothing was written, so no line may say otherwise. The per-Space lines
    // report what the repository holds rather than what an import did: a second
    // run that printed `Imported space ...` under "already holds this
    // aggregate" contradicts its own headline, and a script reading the output
    // cannot tell a no-op from a real write.
    case 'unchanged': {
      io.stdout('The repository already holds this aggregate\n');
      for (const space of result.spaces) {
        io.stdout(`Holds space ${space.snapshot.id} at revision ${space.revision.toString()}\n`);
      }
      return 0;
    }
    case 'already-initialized':
      io.stderr(
        `The repository is already initialized as Meta Space ${result.currentMetaSpaceId}. Re-run with --dangerous-truncate to replace it.\n`,
      );
      return 1;
    case 'conflict':
      io.stderr(
        `The Meta Space changed to ${result.currentMetaSpaceId} during replacement. Nothing was written; run the command again.\n`,
      );
      return 1;
    case 'uninitialized':
      io.stderr(
        'The repository emptied during replacement. Nothing was written; run the command again.\n',
      );
      return 1;
    case 'aggregate-refused':
      io.stderr(
        `Aggregate validation failed:\n${describeAggregateRefusal(result.errors, result.spaces).join('\n')}\n`,
      );
      return 1;
  }
};

const reportStartup = (startup: DatabaseStartupResult, io: CliIo): void => {
  io.stdout(
    `Opened space ${startup.space.snapshot.id} at revision ${startup.space.revision.toString()}\n`,
  );
};

const runExport = async (
  args: readonly string[],
  { repository, io }: RunHyperDependencies,
): Promise<number> => {
  const destination = args[1];
  // An option is never a destination, and neither is nothing. Arity alone let
  // `hyper export --dangerous-truncate` write a complete aggregate into a
  // directory of that name, and `hyper export ''` resolve to the working
  // directory and stage a copy of it. The import path's unknown-flag guard
  // never sees either, because `export` is routed before it.
  if (
    args.length !== 2 ||
    destination === undefined ||
    destination === '' ||
    destination.startsWith('-')
  ) {
    io.stderr(USAGE);
    return 2;
  }
  try {
    const result = await exportAggregate(repository, destination);
    if (result.kind === 'uninitialized') {
      io.stderr('The repository is not initialized, so there is no aggregate to export\n');
      return 1;
    }
    io.stdout(
      `Exported the aggregate rooted at ${result.aggregate.metaSpaceId} to ${destination}\n`,
    );
    for (const space of result.aggregate.spaces) {
      io.stdout(`Exported space ${space.snapshot.id} at revision ${space.revision.toString()}\n`);
    }
    // Not a failure, and not silent either. The files are complete; what did
    // not happen is the bookkeeping behind them, so each Space is named with
    // its reason and the command still succeeds. Left unsaid, the operator
    // would find these Spaces reading as changed since their last export with
    // nothing to explain why.
    if (result.unrecorded.length > 0) {
      io.stderr(
        `The aggregate was exported, but these projected revisions were not recorded, so each Space still reads as changed since its last export:\n${result.unrecorded
          .map(({ spaceId, reason }) => `  ${spaceId}: ${describeError(reason)}`)
          .join('\n')}\n`,
      );
    }
    return 0;
  } catch (error) {
    io.stderr(`Export failed: ${describeError(error)}\n`);
    return 1;
  }
};

export const runHyper = async (
  args: readonly string[],
  dependencies: RunHyperDependencies,
): Promise<number> => {
  if (args[0] === 'export') return runExport(args, dependencies);

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

  let result;
  try {
    result = await importAggregate(path, dependencies.repository, {
      truncate: truncateArguments.length === 1,
      newId: dependencies.newId,
    });
  } catch (error) {
    reportImportFileError(error, dependencies.io);
    return 1;
  }

  return reportImportResult(result, dependencies.io);
};
