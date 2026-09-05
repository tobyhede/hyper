import type { UUID } from '@project/core';
import type { LoadedSpace } from '@project/persistence';
import type { SpaceRepository } from '../persistence/space-repository';
import { defaultContentAggregate } from './default-content';

export interface OpenedDatabaseStartup {
  kind: 'opened';
  space: LoadedSpace;
}

export type DatabaseStartupResult = OpenedDatabaseStartup;

/** Open the durable Space selected from the database catalog. */
export const openDatabaseSelection = async (
  repository: SpaceRepository,
  id: UUID,
): Promise<OpenedDatabaseStartup> => {
  const loaded = await repository.loadSpace(id);
  if (loaded === undefined) throw new Error(`The selected space ${id} could not be loaded`);
  return { kind: 'opened', space: loaded };
};

/**
 * Answer the repository's one permanent Meta identity, establishing it from
 * Default Content only when the repository has none.
 *
 * `initializeAggregate` is the whole of establishment (ADR 0078): there is no
 * second Space-creation path here, and an already-initialized repository is
 * left exactly as it is — `existing` and `already-initialized` both answer with
 * the stored Meta identity rather than reseeding. Contradictory stored state —
 * Spaces without Meta, or an aggregate that fails complete intake — is an
 * invariant failure the repository raises and this deliberately does not catch.
 */
export const establishMetaSpace = async (
  repository: SpaceRepository,
  newId: () => UUID,
): Promise<UUID> => {
  const loaded = await repository.loadAggregate();
  if (loaded.kind === 'loaded') return loaded.aggregate.metaSpaceId;

  const initialized = await repository.initializeAggregate(defaultContentAggregate(newId));
  if (initialized.kind === 'aggregate-refused') {
    throw new Error(
      `Default Content is not a valid aggregate: ${initialized.errors.map(({ kind }) => kind).join(', ')}`,
    );
  }
  return initialized.aggregate.metaSpaceId;
};

/** Open the Meta Space, initializing the repository first when it has none. */
export const resolveDatabaseStartup = async (
  repository: SpaceRepository,
  newId: () => UUID,
): Promise<DatabaseStartupResult> =>
  openDatabaseSelection(repository, await establishMetaSpace(repository, newId));
