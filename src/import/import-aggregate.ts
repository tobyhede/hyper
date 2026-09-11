import type { SpaceSnapshot, UUID } from '@project/core';
import type { SpaceAggregateError } from '@project/graph';
import type { LoadedSpace } from '@project/persistence';
import type { AggregateInput, SpaceRepository } from '../persistence/space-repository';
import { readAggregate } from './read-aggregate';

/**
 * What became of a complete aggregate import.
 *
 * A result rather than a thrown error for every outcome the repository
 * anticipates, because each one is something the operator can act on and the
 * CLI has a different sentence for. Unreadable files still throw
 * `SpaceImportFileError`: an I/O failure is not an outcome of the import, it is
 * the import never having started.
 */
export type AggregateImportResult =
  | { kind: 'imported'; spaces: readonly LoadedSpace[] }
  | { kind: 'unchanged'; spaces: readonly LoadedSpace[] }
  | { kind: 'already-initialized'; currentMetaSpaceId: UUID }
  | { kind: 'conflict'; currentMetaSpaceId: UUID }
  | { kind: 'uninitialized' }
  /**
   * The Spaces travel with the errors because intake reports a bad Space by its
   * position in the collection it was handed, and a position means nothing to
   * someone holding a directory. The renderer resolves it back to the Space's
   * own id (`src/cli/aggregate-refusal.ts`).
   */
  | {
      kind: 'aggregate-refused';
      errors: readonly SpaceAggregateError[];
      spaces: readonly SpaceSnapshot[];
    };

export interface AggregateImportOptions {
  /**
   * Replace the complete stored aggregate rather than initialize an empty
   * repository. This is `--dangerous-truncate`, and the CLI is where the human
   * choice becomes authority to call `replaceAggregate` (ADR 0078).
   */
  readonly truncate: boolean;
  readonly newId: () => UUID;
}

const initialize = async (
  repository: SpaceRepository,
  input: AggregateInput,
): Promise<AggregateImportResult> => {
  const initialized = await repository.initializeAggregate(input);
  switch (initialized.kind) {
    case 'initialized':
      return { kind: 'imported', spaces: initialized.aggregate.spaces };
    // The repository already holds exactly this aggregate. Idempotent rather
    // than a failure (ADR 0078), and reported as its own outcome so a second
    // run does not claim to have written anything.
    case 'existing':
      return { kind: 'unchanged', spaces: initialized.aggregate.spaces };
    case 'already-initialized':
      return { kind: 'already-initialized', currentMetaSpaceId: initialized.aggregate.metaSpaceId };
    case 'aggregate-refused':
      return { kind: 'aggregate-refused', errors: initialized.errors, spaces: input.spaces };
  }
};

/**
 * Initialize from the truncate path, where `already-initialized` means a race
 * was lost rather than an overwrite was refused.
 *
 * The operator passed `--dangerous-truncate`; the repository held nothing when
 * `loadAggregate` read it and holds a Meta Space by the time this writes,
 * because something else established one in between — `pnpm dev`'s startup, or a
 * concurrent `hyper`. Answering `already-initialized` would tell them to re-run
 * with the flag they just passed. It is the conflict outcome, whose sentence
 * already gives the true advice: nothing was written, run the command again.
 */
const initializeUnderTruncate = async (
  repository: SpaceRepository,
  input: AggregateInput,
): Promise<AggregateImportResult> => {
  const result = await initialize(repository, input);
  return result.kind === 'already-initialized'
    ? { kind: 'conflict', currentMetaSpaceId: result.currentMetaSpaceId }
    : result;
};

/**
 * Import one complete Meta-rooted aggregate from a canonical directory.
 *
 * Two doors, never a mode parameter on one (ADR 0078). Without
 * `--dangerous-truncate` this initializes a repository that has none, and an
 * initialized repository is left exactly as it is — an import that would have
 * overwritten authored state says so instead of doing it. With it, the stored
 * aggregate and its Meta identity are replaced atomically, authorized by the
 * identity `loadAggregate` just reported rather than by one the caller supplies:
 * a Meta identity that moved in between is a conflict, and the replacement
 * rolls back rather than landing on a repository the operator was not looking
 * at.
 *
 * There is deliberately **no merge**. Import does not update, reconcile or add
 * to stored content; the aggregate on disk becomes the whole of the aggregate
 * stored, or nothing happens.
 */
export const importAggregate = async (
  path: string,
  repository: SpaceRepository,
  { truncate, newId }: AggregateImportOptions,
): Promise<AggregateImportResult> => {
  const source = await readAggregate(path, newId);
  const input: AggregateInput = { metaSpaceId: source.metaSpaceId, spaces: source.spaces };

  if (!truncate) return initialize(repository, input);

  // Replacement needs the identity it is replacing, and `replaceAggregate`
  // refuses to establish first state, so an empty repository takes the
  // initializing door even under `--dangerous-truncate`: there is nothing to
  // truncate, and the flag is permission to destroy rather than a demand that
  // something be destroyed.
  const loaded = await repository.loadAggregate();
  if (loaded.kind === 'uninitialized') return initializeUnderTruncate(repository, input);

  const replaced = await repository.replaceAggregate(input, loaded.aggregate.metaSpaceId);
  switch (replaced.kind) {
    case 'replaced':
      return { kind: 'imported', spaces: replaced.aggregate.spaces };
    case 'conflict':
      return { kind: 'conflict', currentMetaSpaceId: replaced.currentMetaSpaceId };
    // The repository emptied between the read above and the replacement. The
    // replacement rolled back, so nothing was written and running the command
    // again finds the initializing door.
    case 'uninitialized':
      return { kind: 'uninitialized' };
    case 'aggregate-refused':
      return { kind: 'aggregate-refused', errors: replaced.errors, spaces: input.spaces };
  }
};
