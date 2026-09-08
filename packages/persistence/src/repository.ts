import type { UUID } from '@project/core';
import type {
  CommittedSpaceRevision,
  AggregateLoadResult,
  LoadedSpace,
  SpaceCommit,
  SpaceConflict,
  SpaceSummary,
} from './backend';
import type { SpaceAggregateError } from '@project/graph';

/**
 * Stored state no aggregate can be read from: Spaces that no Meta identity
 * names, a stored aggregate that fails complete intake, or a stored document
 * that fails to parse at all.
 *
 * Its own type because two unrelated failures arrive at a reader the same way —
 * this one, and a database that is simply unreachable — and a bare `Error`
 * makes them one thing. They are not one thing: broken stored state is a defect
 * this deployment carries and no retry cures, while an unreachable database is
 * temporary and a later attempt is exactly the answer. `src/http/space-host.ts`
 * answers them with different statuses, and start-up stops retrying on this
 * one, both by asking {@link isAggregateInvariant} rather than by matching
 * message prose.
 *
 * It lives here, beside `loadAggregate`, rather than on the server-only
 * superset that used to declare it. `loadAggregate` is `SpaceResourceRepository`'s,
 * so the failure it raises is the shared seam's too — declared once for both
 * consumers, the way the seam itself is. On the superset, `@project/http` could
 * not name the identity of the error its own repository handed it.
 *
 * Every implementation of the seam raises it — `PostgresSpaceRepository` and
 * the memory double alike — or a memory-backed test proves nothing about the
 * database.
 */
export class AggregateInvariantError extends Error {}

/**
 * Whether a failure out of the stored seam is broken stored state.
 *
 * The cause chain rather than the error itself, because the driver does not
 * always rethrow what the transaction callback threw: when the rollback after a
 * callback error itself fails, `@prisma-next/sql-runtime` destroys the
 * connection and throws `RUNTIME.TRANSACTION_ROLLBACK_FAILED`, carrying the
 * original only on `.cause`. A bare `instanceof` reads that as an unreachable
 * database, answers `try again later` for a defect, and spends a retry budget
 * on something no retry cures.
 *
 * The walk is bounded by a seen set. A chain is data a driver built, and a
 * cycle in one would otherwise hang whichever reader classifies the error.
 */
export const isAggregateInvariant = (cause: unknown): boolean => {
  const seen = new Set<unknown>();
  let current = cause;
  while (current instanceof Error && !seen.has(current)) {
    if (current instanceof AggregateInvariantError) return true;
    seen.add(current);
    current = current.cause;
  }
  return false;
};

/** The store-side result has no transport failures. */
export type RepositoryCommitResult =
  | {
      kind: 'committed';
      revisions: readonly CommittedSpaceRevision[];
      deletedSpaceIds: readonly UUID[];
    }
  | { kind: 'conflict'; conflicts: readonly SpaceConflict[] }
  | { kind: 'aggregate-refused'; errors: readonly SpaceAggregateError[] }
  | { kind: 'rejected'; code: 'invalid-commit'; message: string };

/** The narrow stored seam consumed by the Fetch application. */
export interface SpaceResourceRepository {
  listSpaces(): Promise<readonly SpaceSummary[]>;
  loadSpace(id: UUID): Promise<LoadedSpace | undefined>;
  loadAggregate(): Promise<AggregateLoadResult>;
  commit(request: SpaceCommit): Promise<RepositoryCommitResult>;
}
