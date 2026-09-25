import type { UUID } from '@project/core';
import { classifyStoredFailure, type LoadedSpace } from '@project/persistence';
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
 * There is deliberately no attempt bound on an unreachable database. A host
 * that outlived a bounded retry would serve `503` at the root forever, because
 * the root address establishes nothing and nothing else would — a bound would
 * not surface the problem, it would make it permanent. Every failed
 * attempt is reported, so a long outage is visible while it lasts. What stops
 * the retry is a failure no wait cures ({@link CONFIRMING_FAILURES}), and what
 * tells an operator it stopped is the terminal report in
 * `src/http/database-http-runtime.ts`, not a silent stop.
 */
export const META_SPACE_RETRY_INITIAL_DELAY_MS = 5_000;
export const META_SPACE_RETRY_MAX_DELAY_MS = 60_000;

/**
 * Two consecutive failures that no wait cures, not one.
 *
 * Two kinds count: broken stored state, and a failure neither named arm
 * describes — a code defect, or a driver failure nobody anticipated (ticket
 * 31). Only an unreachable database is worth waiting out, and one of those
 * between two others resets the count, since it says nothing about either.
 *
 * Not one, because one invariant failure is also what a healthy repository
 * looks like for an instant. On PostgreSQL `loadAggregate` reads in two
 * statements: `lockMetaIdentity` finds no Meta row, then `loadEverySpace` reads
 * Spaces — inside one transaction, but at READ COMMITTED each statement takes
 * its own snapshot — so a rival host committing between the two is reported as
 * Spaces without Meta. Two hosts against one fresh database is the ordinary way
 * to see it — a dev server and `test:integration:postgres`. The interleaving is
 * over by the next read, and stored state that is genuinely broken fails the
 * same way every time. An unclassified failure gets the same second look: a
 * one-off is not a verdict, and a defect repeats.
 */
const CONFIRMING_FAILURES = 2;

/**
 * Default Content is not a valid aggregate.
 *
 * A defect in the code this process is running, not in what the database holds
 * and not in whether the database answers. No read and no wait can change it, so
 * the retry stops on it at once rather than waiting for a second attempt to
 * confirm what a second attempt cannot change.
 */
export class DefaultContentInvalidError extends Error {}

/** What start-up's retry is given instead of the two ambient resources it would name. */
export interface MetaSpaceRetryOptions {
  wait: (milliseconds: number) => Promise<void>;
  report: (cause: unknown) => void;
}

/**
 * Try establishment again after a first attempt failed, until one succeeds or a
 * failure arrives that no later attempt can cure.
 *
 * Establishment is start-up's alone — `GET /` is a safe method and must not
 * create durable authored state — and start-up owns the failure, so it owns
 * the repair too.
 *
 * `wait` and `report` are the caller's rather than a timer and a stream this
 * module names (ADR 0016, ADR 0081), and they arrive together in one object
 * because they are one collaborator set and `createApp` already gave them a
 * born type. The composition root passes a timer that cannot hold the process
 * open, and a test passes one that records instead of sleeping.
 *
 * Nothing is thrown. Nothing awaits this, and a rejection nothing listens for is
 * what takes a Node process down — which includes a rejection out of `report`,
 * so reporting a failure cannot become the failure that ends the recovery.
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
  let consecutiveUncuredFailures = 0;
  let delay = META_SPACE_RETRY_INITIAL_DELAY_MS;
  for (;;) {
    await wait(delay);
    delay = Math.min(delay * 2, META_SPACE_RETRY_MAX_DELAY_MS);
    try {
      return await establishMetaSpace(repository, newId);
    } catch (error) {
      reportSafely(error);
      if (error instanceof DefaultContentInvalidError) return undefined;
      if (classifyStoredFailure(error) === 'unavailable') {
        // An outage says nothing about whether the failures around it would
        // recur once the database answers, so it cannot help confirm them.
        consecutiveUncuredFailures = 0;
        continue;
      }
      consecutiveUncuredFailures += 1;
      if (consecutiveUncuredFailures === CONFIRMING_FAILURES) return undefined;
    }
  }
};

/** Open the Meta Space, initializing the repository first when it has none. */
export const resolveDatabaseStartup = async (
  repository: SpaceRepository,
  newId: () => UUID,
): Promise<DatabaseStartupResult> =>
  openDatabaseSelection(repository, await establishMetaSpace(repository, newId));
