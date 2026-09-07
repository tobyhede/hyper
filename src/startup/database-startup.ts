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
  let consecutiveInvariantFailures = 0;
  for (let attempt = 0; attempt < META_SPACE_RETRY_ATTEMPTS; attempt += 1) {
    await wait(META_SPACE_RETRY_DELAY_MS);
    try {
      return await establishMetaSpace(repository, newId);
    } catch (error) {
      report(error);
      if (!(error instanceof AggregateInvariantError)) {
        consecutiveInvariantFailures = 0;
        continue;
      }
      // Waiting does not cure contradictory stored state, so this is where the
      // retry stops — but not on the first one, because one is also what a
      // healthy repository looks like for an instant. `loadAggregate` runs at
      // READ COMMITTED and reads in two statements: `lockMetaIdentity` finds no
      // Meta row, then `loadEverySpace` reads Spaces under a fresh snapshot, so
      // a rival host committing `replaceAllSpaces` between the two is reported
      // as Spaces without Meta. Two hosts against one fresh database is the
      // ordinary way to see it — a dev server and `test:integration:postgres`.
      //
      // A second consecutive one is what separates the two: the interleaving
      // is over by the next read, and stored state that is genuinely broken
      // fails the same way every time. A different failure in between says
      // nothing about stored state, so it resets the count rather than
      // confirming it. Repairing the race itself is the repository's problem
      // and not this loop's.
      consecutiveInvariantFailures += 1;
      if (consecutiveInvariantFailures === 2) return undefined;
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
