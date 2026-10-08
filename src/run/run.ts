import { readdir } from 'node:fs/promises';
import type { UUID } from '@project/core';
import type { RepositoryCommitResult, SpaceCommit } from '@project/persistence';
import { AggregateDirectoryError, isMissingFile } from '../aggregate-directory';
import { describeAggregateRefusal } from '../cli/aggregate-refusal';
import { exportAggregate } from '../export/export-aggregate';
import { createSpaceHost, type SpaceHostApplication } from '../http/space-host';
import { importAggregate } from '../import/import-aggregate';
import { MemorySpaceRepository } from '../persistence/memory-space-repository';
import { establishMetaSpace } from '../startup/database-startup';

/**
 * How long edits must be quiet before the run writes them (ADR 0117), and how
 * long a failed write waits before it is tried again.
 */
export const RUN_QUIET_MILLISECONDS = 1_000;

/** Calls `callback` once after `milliseconds`, unless the answered cancel runs first. */
export type RunSchedule = (callback: () => void, milliseconds: number) => () => void;

/** What a run tells its owner about writing the directory. */
export type RunEvent =
  { readonly kind: 'written' } | { readonly kind: 'write-failed'; readonly reason: unknown };

export interface RunOptions {
  /** Mints the ids of the new Space, and those a hand-authored directory omits (ADR 0109). */
  readonly newId: () => UUID;
  /** The clock behind the quiet period, injected so a test can advance it (ADR 0109). */
  readonly schedule: RunSchedule;
  readonly report: (event: RunEvent) => void;
}

export type RunStopResult =
  | { readonly kind: 'stopped' }
  /** The last write failed, so edits made during the run are not all on disk. */
  | { readonly kind: 'unwritten'; readonly reason: unknown };

export interface Run {
  /** The application the run serves, over the run's own memory store. */
  readonly host: SpaceHostApplication;
  /** True when the directory was missing or empty and now holds the new Space. */
  readonly established: boolean;
  /**
   * Write any edit not yet on disk, wait for every write in flight, and stop
   * writing. Resolves once the directory holds everything committed.
   */
  stop(): Promise<RunStopResult>;
}

export type RunStart =
  | { readonly kind: 'running'; readonly run: Run }
  /** The directory could not be read as an Aggregate directory. */
  | { readonly kind: 'unreadable'; readonly diagnostics: readonly string[] }
  /** The directory read cleanly, and aggregate intake refused what it holds. */
  | { readonly kind: 'aggregate-refused'; readonly diagnostics: readonly string[] };

/** A memory store that tells the run about every commit it accepts. */
class ObservedRepository extends MemorySpaceRepository {
  readonly #committed: () => void;

  constructor(committed: () => void) {
    super();
    this.#committed = committed;
  }

  override async commit(request: SpaceCommit): Promise<RepositoryCommitResult> {
    const result = await super.commit(request);
    if (result.kind === 'committed') this.#committed();
    return result;
  }
}

/**
 * Missing and empty are both the new Space; anything else is Imported. A
 * dot-entry — `.git` from a fresh `git init`, `.DS_Store` — is not content, so
 * a directory holding only those is empty.
 */
const holdsNothing = async (directory: string): Promise<boolean> => {
  try {
    return (await readdir(directory)).every((entry) => entry.startsWith('.'));
  } catch (error) {
    if (isMissingFile(error)) return true;
    throw error;
  }
};

/**
 * Write the store to the directory after each quiet period and on stop, one
 * write at a time.
 *
 * `changed` is set by every accepted commit and cleared as a write reads the
 * store, so a commit that lands while a write is under way leaves it set. A
 * write requested while one is running is queued behind it, and every request
 * made before the queued write begins joins that same write — which is what
 * makes any number of edits during one write cost exactly one further write.
 */
const createWriter = (
  repository: MemorySpaceRepository,
  directory: string,
  report: (event: RunEvent) => void,
) => {
  let changed = false;
  let queued = false;
  let failure: { readonly reason: unknown } | undefined;
  let tail: Promise<void> = Promise.resolve();

  const writeOnce = async (): Promise<void> => {
    if (!changed) return;
    changed = false;
    try {
      const result = await exportAggregate(repository, directory);
      if (result.kind === 'uninitialized') {
        throw new Error('The run holds no aggregate to write');
      }
      if (result.kind === 'would-not-read-back') {
        throw new Error(
          `The written aggregate does not read back as a valid aggregate:\n${describeAggregateRefusal(result.errors, result.spaces).join('\n')}`,
        );
      }
      failure = undefined;
      report({ kind: 'written' });
    } catch (reason) {
      changed = true;
      failure = { reason };
      report({ kind: 'write-failed', reason });
    }
  };

  return {
    changed: () => {
      changed = true;
    },
    write: (): Promise<void> => {
      if (queued) return tail;
      queued = true;
      tail = tail.then(() => {
        queued = false;
        return writeOnce();
      });
      return tail;
    },
    failure: () => failure,
  };
};

/**
 * Run an Aggregate directory (ADR 0117): Import it into a fresh memory store,
 * or establish the new Space there when it is missing or empty and write it at
 * once, then write every committed edit back once edits have been quiet for
 * {@link RUN_QUIET_MILLISECONDS}. A write that fails while the run serves is
 * tried again after the same period, so edits it did not write do not wait for
 * the next commit or the stop.
 *
 * Nothing is written for an existing directory until something is committed,
 * so a run that is stopped without an edit leaves the directory as it found it.
 * The directory is the durable copy; the store is discarded with the run.
 */
export const startRun = async (directory: string, options: RunOptions): Promise<RunStart> => {
  let pending: (() => void) | undefined;
  // Writes are scheduled only while the run serves: a failed write during
  // start-up fails the start, and nothing is scheduled once stop has begun.
  let serving = false;
  const scheduleWrite = (): void => {
    pending?.();
    pending = options.schedule(() => {
      pending = undefined;
      void writer.write();
    }, RUN_QUIET_MILLISECONDS);
  };
  const repository = new ObservedRepository(() => {
    if (!serving) return;
    writer.changed();
    scheduleWrite();
  });
  const writer = createWriter(repository, directory, (event) => {
    options.report(event);
    if (event.kind === 'write-failed' && serving) scheduleWrite();
  });

  const established = await holdsNothing(directory);
  if (established) {
    await establishMetaSpace(repository, options.newId);
    writer.changed();
    await writer.write();
    const failure = writer.failure();
    if (failure !== undefined) throw failure.reason;
  } else {
    let imported;
    try {
      imported = await importAggregate(directory, repository, {
        replace: false,
        newId: options.newId,
      });
    } catch (error) {
      if (!(error instanceof AggregateDirectoryError)) throw error;
      return { kind: 'unreadable', diagnostics: error.diagnostics };
    }
    if (imported.kind === 'aggregate-refused') {
      return {
        kind: 'aggregate-refused',
        diagnostics: describeAggregateRefusal(imported.errors, imported.spaces),
      };
    }
    if (imported.kind !== 'imported') {
      throw new Error(`A fresh store answered ${imported.kind} to Importing ${directory}`);
    }
  }

  serving = true;
  const run: Run = {
    host: createSpaceHost(repository, options.newId),
    established,
    stop: async () => {
      serving = false;
      pending?.();
      pending = undefined;
      await writer.write();
      const failure = writer.failure();
      return failure === undefined
        ? { kind: 'stopped' }
        : { kind: 'unwritten', reason: failure.reason };
    },
  };
  return { kind: 'running', run };
};
