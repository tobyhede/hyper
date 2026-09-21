import type { UUID } from '@project/core';
import type {
  AggregateLoadResult,
  CommitOutcome,
  LoadedSpace,
  SpaceCommit,
  SpaceSummary,
} from './backend';

/**
 * Stored state no aggregate can be read from: Spaces that no Meta identity
 * names, a stored aggregate that fails complete intake, or a stored document
 * that fails to parse at all.
 *
 * Its own type because two unrelated failures arrive at a reader the same way —
 * this one, and a database that is simply unreachable — and a bare `Error`
 * makes them one state. They are not one state: broken stored state is a defect
 * this deployment carries and no retry cures, while an unreachable database is
 * temporary and a later attempt is exactly the answer. The unreachable half has
 * its own name too, {@link PersistenceUnavailableError}, so neither is merely
 * the absence of the other, and a failure that is neither stays neither
 * ({@link classifyStoredFailure}).
 *
 * It lives here, beside `loadAggregate`, rather than on the server-only
 * superset that used to declare it. `loadAggregate` is `StoredSpaceRepository`'s,
 * so the failure it raises is the shared seam's too — declared once for both
 * consumers, the way the seam itself is. On the superset, `@project/http` could
 * not name the identity of the error its own repository handed it.
 *
 * Every implementation of the seam raises it — the one SQL repository
 * (`SqlSpaceRepository`, ADR 0095) and its memory double,
 * `MemorySpaceRepository`, alike — or a memory-backed test proves nothing
 * about the database. `MemorySpaceBackend` is not on this seam: it doubles the
 * browser-side `SpaceBackend`, whose HTTP implementation never raises this.
 */
export class AggregateInvariantError extends Error {}

/**
 * The database did not answer, or answered "not now": it refused or dropped
 * the connection, had been closed underneath the repository, was starting
 * up, shutting down or out of connections, or aborted the work for
 * contention — a lock it would not wait for, a deadlock or serialization
 * failure it resolved against this transaction, or a concurrent replacement
 * that moved the Meta identity while the repository was locking it. Temporary by nature, so a reader answers
 * "try again later" and start-up keeps trying.
 *
 * A repository raises it, carrying the driver's own failure on `.cause` where
 * there is one, rather than every reader asking a predicate over the driver's
 * error shapes: `@project/http` is browser-safe and cannot name a driver,
 * and what counts as unreachable is a fact about each database, which its
 * store answers
 * (`SqlStore.isUnavailable`, `src/persistence/sql-store.ts`) and
 * `SqlSpaceRepository` asks. It is decided by what a failure carries, never by
 * where it was raised, and by structured fields rather than message prose —
 * save the one compatibility check `src/sqlite/sql-store.ts` documents for its
 * pinned runtime's closed-client error.
 */
export class PersistenceUnavailableError extends Error {}

/**
 * Whether the cause chain holds an instance of `type`.
 *
 * The chain rather than the error itself, because the driver does not always
 * rethrow what the transaction callback threw: when the rollback after a
 * callback error itself fails, `@prisma-next/sql-runtime` destroys the
 * connection and throws `RUNTIME.TRANSACTION_ROLLBACK_FAILED`, carrying the
 * original only on `.cause`, and a failed COMMIT is wrapped the same way. A bare
 * `instanceof` reads either as whatever the wrapper happens to be.
 *
 * The walk is bounded by a seen set. A chain is data a driver built, and a
 * cycle in one would otherwise hang whichever reader classifies the error.
 */
const causeChainHolds = (
  cause: unknown,
  type: typeof AggregateInvariantError | typeof PersistenceUnavailableError,
): boolean => {
  const seen = new Set<unknown>();
  let current = cause;
  while (current instanceof Error && !seen.has(current)) {
    if (current instanceof type) return true;
    seen.add(current);
    current = current.cause;
  }
  return false;
};

/**
 * Whether a failure out of the stored seam is broken stored state, anywhere on
 * its cause chain. {@link classifyStoredFailure} is what a reader choosing an
 * answer asks; this is the one question on its own, for a repository deciding
 * whether a failure is already named.
 */
export const isAggregateInvariant = (cause: unknown): boolean =>
  causeChainHolds(cause, AggregateInvariantError);

/** Whether a failure out of the stored seam is an unreachable database, anywhere on its cause chain. */
export const isPersistenceUnavailable = (cause: unknown): boolean =>
  causeChainHolds(cause, PersistenceUnavailableError);

/**
 * What a failure out of the stored seam is, as a reader has to act on it:
 * broken stored state, an unreachable database, or neither.
 *
 * `unclassified` is a real answer rather than a gap. It is a code defect, or a
 * driver failure nobody anticipated, and it is deliberately not folded into
 * either named arm: calling it unavailable tells a client to retry what no
 * retry cures, and calling it broken stored state blames the data for a fault
 * in the code. Each reader decides what it answers for it.
 *
 * Broken stored state wins when a chain carries both, because it is the claim
 * about the data: a rollback that failed on a dropped connection after the
 * callback found broken state still found it.
 */
export type StoredFailure = 'broken-stored-state' | 'unavailable' | 'unclassified';

export const classifyStoredFailure = (cause: unknown): StoredFailure => {
  if (isAggregateInvariant(cause)) return 'broken-stored-state';
  if (isPersistenceUnavailable(cause)) return 'unavailable';
  return 'unclassified';
};

/**
 * The store-side result: what the store decided, plus its refusal of a request
 * it will not judge. No transport failures — nothing here has a client.
 */
export type RepositoryCommitResult =
  CommitOutcome | { kind: 'rejected'; code: 'invalid-commit'; message: string };

/** The narrow stored seam consumed by the Fetch application. */
export interface StoredSpaceRepository {
  listSpaces(): Promise<readonly SpaceSummary[]>;
  loadSpace(id: UUID): Promise<LoadedSpace | undefined>;
  loadAggregate(): Promise<AggregateLoadResult>;
  commit(request: SpaceCommit): Promise<RepositoryCommitResult>;
}
