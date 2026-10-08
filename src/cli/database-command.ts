import type { UUID } from '@project/core';
import { describeAggregateRefusal } from './aggregate-refusal';
import { exportAggregate } from '../export/export-aggregate';
import { importAggregate, type AggregateImportResult } from '../import/import-aggregate';
import { AggregateDirectoryError } from '../aggregate-directory';
import type { SpaceRepository } from '../persistence/space-repository';
import type { DatabaseCommand } from './arguments';

export interface CliIo {
  stdout(message: string): void;
  stderr(message: string): void;
}

export interface DatabaseCommandDependencies {
  repository: SpaceRepository;
  io: CliIo;
  /**
   * The composition-owned identity source (ADR 0109). Import mints the nested
   * ids a hand-authored aggregate leaves out through it.
   */
  newId: () => UUID;
}

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const reportImportFileError = (error: unknown, io: CliIo): void => {
  if (error instanceof AggregateDirectoryError) {
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
 * `--dangerous-replace`, a conflict needs the command run again, and a refused
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
        `The repository is already initialized as Meta Space ${result.currentMetaSpaceId}. Re-run with --dangerous-replace to replace it.\n`,
      );
      return 1;
    case 'conflict':
      // A conflict here does not always mean the Meta identity itself moved —
      // the repository also answers it when a stored Space changes mid-
      // replacement, reporting back the same id the command already expected
      // (`SqlSpaceRepository.replaceAggregate`'s `StaleSpaceRevisionError`
      // path). So the sentence states what is currently stored as a fact
      // rather than claiming the id is new; the same-id case is held by
      // `test/unit/hyper-cli.test.ts`'s "does not claim the Meta identity
      // moved ..." test.
      io.stderr(
        result.currentMetaSpaceId === undefined
          ? 'The repository changed during replacement, and no Meta Space is stored now. Nothing was written; run the command again.\n'
          : `The repository changed during replacement; it now holds Meta Space ${result.currentMetaSpaceId}. Nothing was written; run the command again.\n`,
      );
      return 1;
    case 'aggregate-refused':
      io.stderr(
        `Aggregate validation failed:\n${describeAggregateRefusal(result.errors, result.spaces).join('\n')}\n`,
      );
      return 1;
  }
};

const runExport = async (
  destination: string,
  { repository, io }: DatabaseCommandDependencies,
): Promise<number> => {
  try {
    const result = await exportAggregate(repository, destination);
    switch (result.kind) {
      case 'uninitialized':
        io.stderr('The repository is not initialized, so there is no aggregate to export\n');
        return 1;
      case 'would-not-read-back':
        io.stderr(
          `Exported aggregate does not read back as a valid aggregate:\n${describeAggregateRefusal(result.errors, result.spaces).join('\n')}\n`,
        );
        return 1;
      case 'exported': {
        io.stdout(
          `Exported the aggregate rooted at ${result.aggregate.metaSpaceId} to ${destination}\n`,
        );
        for (const space of result.aggregate.spaces) {
          io.stdout(
            `Exported space ${space.snapshot.id} at revision ${space.revision.toString()}\n`,
          );
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
      }
    }
  } catch (error) {
    io.stderr(`Export failed: ${describeError(error)}\n`);
    return 1;
  }
};

const runImport = async (
  directory: string,
  replace: boolean,
  { repository, io, newId }: DatabaseCommandDependencies,
): Promise<number> => {
  let result;
  try {
    result = await importAggregate(directory, repository, { replace, newId });
  } catch (error) {
    reportImportFileError(error, io);
    return 1;
  }
  return reportImportResult(result, io);
};

/** Run an `import` or `export` against the repository its store opened. */
export const runDatabaseCommand = (
  command: DatabaseCommand,
  dependencies: DatabaseCommandDependencies,
): Promise<number> =>
  command.verb === 'import'
    ? runImport(command.directory, command.replace, dependencies)
    : runExport(command.directory, dependencies);
