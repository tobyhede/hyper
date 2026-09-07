import type { UUID } from '@project/core';
import type { LoadedSpace } from '@project/persistence';
import { AggregateInvariantError, type SpaceRepository } from '../persistence/space-repository';
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

/**
 * How many times establishment is tried again after the first attempt failed,
 * and how long start-up waits between attempts.
 *
 * Bounded, and small enough to read as one number: the recovery this buys is
 * for a database that was down when the process started and came back shortly
 * after, which is the sequence PR 156 made possible when it stopped a failed
 * establishment being fatal to composition. A host still failing a minute later
 * is a deployment someone has to look at rather than one a timer will fix, and
 * an unbounded retry would only hide that.
 */
export const META_SPACE_RETRY_ATTEMPTS = 12;
export const META_SPACE_RETRY_DELAY_MS = 5_000;

/**
 * Try establishment again after a first attempt failed, until one succeeds or
 * the bound above is spent.
 *
 * This is where the repair the root address used to perform now lives. `GET /`
 * established the Meta Space when the repository had none, so a safe method
 * created durable authored state; establishment is start-up's alone, and
 * start-up owns the failure, so it owns the repair too.
 *
 * `wait` is the caller's rather than a timer this module names (ADR 0016,
 * ADR 0081): the composition root passes one that cannot hold the process open,
 * and a test passes one that records instead of sleeping. Failures are reported
 * through `report` and never thrown — nothing awaits this, and a rejection
 * nothing is listening for is what takes a Node process down.
 */
export const retryMetaSpaceEstablishment = async (
  repository: SpaceRepository,
  newId: () => UUID,
  wait: (milliseconds: number) => Promise<void>,
  report: (cause: unknown) => void,
): Promise<UUID | undefined> => {
  for (let attempt = 0; attempt < META_SPACE_RETRY_ATTEMPTS; attempt += 1) {
    await wait(META_SPACE_RETRY_DELAY_MS);
    try {
      return await establishMetaSpace(repository, newId);
    } catch (error) {
      report(error);
      // Waiting does not cure contradictory stored state: the next attempt
      // reads the same documents and fails the same way. Only an unreachable
      // database is worth trying again for, and the two are told apart by type
      // rather than by matching message prose.
      if (error instanceof AggregateInvariantError) return undefined;
    }
  }
  return undefined;
};

/** Open the Meta Space, initializing the repository first when it has none. */
export const resolveDatabaseStartup = async (
  repository: SpaceRepository,
  newId: () => UUID,
): Promise<DatabaseStartupResult> =>
  openDatabaseSelection(repository, await establishMetaSpace(repository, newId));
