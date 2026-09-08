import type { UUID } from '@project/core';
import { isAggregateInvariant, type LoadedSpace } from '@project/persistence';
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
    throw new DefaultContentInvalidError(
      `Default Content is not a valid aggregate: ${initialized.errors.map(({ kind }) => kind).join(', ')}`,
    );
  }
  return initialized.aggregate.metaSpaceId;
};

/**
 * How long start-up waits between establishment attempts.
 *
 * The delay doubles from the first up to the second, and then holds. Growing it
 * keeps a database that is down for an hour from being read every five seconds
 * for the life of the process; capping the growth keeps a database that comes
 * back late from waiting hours to be found.
 *
 * There is deliberately no attempt bound. A bounded retry left a host that
 * outlived it serving `503` at the root forever, because the root address no
 * longer establishes anything and nothing else was going to — the bound did not
 * surface the problem, it made it permanent. What tells an operator the
 * difference between waiting and giving up is the terminal report in
 * `src/http/postgres-http-runtime.ts`, not a silent stop.
 */
export const META_SPACE_RETRY_INITIAL_DELAY_MS = 5_000;
export const META_SPACE_RETRY_MAX_DELAY_MS = 60_000;

/**
 * Two consecutive invariant failures, not one.
 *
 * One is also what a healthy repository looks like for an instant.
 * `loadAggregate` runs at READ COMMITTED and reads in two statements:
 * `lockMetaIdentity` finds no Meta row, then `loadEverySpace` reads Spaces under
 * a fresh snapshot, so a rival host committing between the two is reported as
 * Spaces without Meta. Two hosts against one fresh database is the ordinary way
 * to see it — a dev server and `test:integration:postgres`. The interleaving is
 * over by the next read, and stored state that is genuinely broken fails the
 * same way every time.
 */
const CONFIRMING_INVARIANT_FAILURES = 2;

/**
 * Default Content is not a valid aggregate.
 *
 * A defect in the code this process is running, not in what the database holds
 * and not in whether the database answers. No read and no wait can change it, so
 * the retry stops on it at once. Without its own type it read as "not an
 * invariant failure", which reset the consecutive count — harmless under an
 * attempt bound, and an endless loop without one.
 */
export class DefaultContentInvalidError extends Error {}

/** What start-up's retry is given instead of the two ambient things it would name. */
export interface MetaSpaceRetryOptions {
  wait: (milliseconds: number) => Promise<void>;
  report: (cause: unknown) => void;
}

/**
 * Try establishment again after a first attempt failed, until one succeeds or a
 * failure arrives that no later attempt can cure.
 *
 * This is where the repair the root address used to perform now lives. `GET /`
 * established the Meta Space when the repository had none, so a safe method
 * created durable authored state; establishment is start-up's alone, and
 * start-up owns the failure, so it owns the repair too.
 *
 * `wait` and `report` are the caller's rather than a timer and a stream this
 * module names (ADR 0016, ADR 0081), and they arrive together in one object
 * because they are one collaborator set and `createApp` already gave them a
 * born type. The composition root passes a timer that cannot hold the process
 * open, and a test passes one that records instead of sleeping.
 *
 * Nothing is thrown. Nothing awaits this, and a rejection nothing listens for is
 * what takes a Node process down — which includes a rejection out of `report`,
 * so reporting a failure cannot become the thing that ends the recovery.
 */
export const retryMetaSpaceEstablishment = async (
  repository: SpaceRepository,
  newId: () => UUID,
  { wait, report }: MetaSpaceRetryOptions,
): Promise<UUID | undefined> => {
  const reportSafely = (cause: unknown): void => {
    try {
      report(cause);
    } catch {
      // There is nowhere left to report the failure of a reporter.
    }
  };
  let consecutiveInvariantFailures = 0;
  let delay = META_SPACE_RETRY_INITIAL_DELAY_MS;
  for (;;) {
    await wait(delay);
    delay = Math.min(delay * 2, META_SPACE_RETRY_MAX_DELAY_MS);
    try {
      return await establishMetaSpace(repository, newId);
    } catch (error) {
      reportSafely(error);
      if (error instanceof DefaultContentInvalidError) return undefined;
      if (!isAggregateInvariant(error)) {
        // A failure that says nothing about stored state cannot help confirm it.
        consecutiveInvariantFailures = 0;
        continue;
      }
      consecutiveInvariantFailures += 1;
      if (consecutiveInvariantFailures === CONFIRMING_INVARIANT_FAILURES) return undefined;
    }
  }
};

/** Open the Meta Space, initializing the repository first when it has none. */
export const resolveDatabaseStartup = async (
  repository: SpaceRepository,
  newId: () => UUID,
): Promise<DatabaseStartupResult> =>
  openDatabaseSelection(repository, await establishMetaSpace(repository, newId));
