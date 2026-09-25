export * from './backend';
/* The rules a commit is judged by, decided once for every implementation
 * (ADR 0095). The rest of the module is private to it. */
export { commitRequestRefusal, committedRevision, decideCommit } from './commit-decision';
/* The wire contract's two ends live in different processes. These are the
 * codecs the portable HTTP package reads the wire through. */
export {
  COMMIT_OUTCOME_WIRE,
  commitOutcomeDecoder,
  decodeCommitRequest,
  decodeCommitConflict,
  decodeCommitRefusal,
  decodeCommitResponse,
  decodeCommittedRevision,
  decodeProblemDetails,
  decodeLoadedSpace,
  decodeLoadedAggregate,
  decodeSpaceSummaries,
  encodeCommitRequest,
  encodeCommitConflict,
  encodeCommitRefusal,
  encodeCommitResponse,
  encodeLoadedSpace,
  encodeLoadedAggregate,
  encodeProblemDetails,
  problemCodeForType,
  problemCatalogue,
} from './http-protocol';
export type {
  CommitRequestJson,
  CommitConflictBody,
  CommitRefusalBody,
  CommitResponseBody,
  DecodedCommitRequest,
  HyperProblemCode,
  HyperProblemStatus,
  HyperProblemType,
  LoadedSpaceJson,
  LoadedAggregateJson,
  ProblemDetails,
  ProblemError,
} from './http-protocol';
/* The one shared codec for a stored Revision column (ADR 0095): canonical
 * non-negative decimal TEXT on both databases, bound to the same 2^63−1
 * ceiling `http-protocol.ts`'s wire decode also enforces.
 * `src/persistence/*-space-repository.ts` reads and writes revisions through
 * this rather than each adapter owning its own format/ceiling check.
 * `CANONICAL_DECIMAL` belongs here too because `HttpSpaceBackend` validates a
 * revision header against it before decoding. */
export {
  CANONICAL_DECIMAL,
  REVISION_CEILING,
  RevisionCodecError,
  decodeStoredRevision,
  encodeStoredRevision,
} from './revision-codec';
/* Two test-facing helpers, two doors, and the difference is what they are.
 * `MemorySpaceBackendTestControl` is named by `MemorySpaceBackend`'s public
 * constructor, so a caller that cannot import it cannot construct the adapter
 * this package ships — it is public surface. The shared backend *suite* imports
 * vitest and only a test runner can execute it, so it stays behind the
 * `./test-support` subpath instead. */
export { MemorySpaceBackend, MemorySpaceBackendTestControl } from './memory';
export * from './observable-state';
/* The id order every in-memory double answers reads in, stated once.
 * `MemorySpaceBackend` above and `MemorySpaceRepository` under `test/support`
 * both stand in for the SQL adapters, which order at the database; two copies
 * of the rule would drift the day either was touched. */
export { ascendingById, readInIdOrder } from './read-order';
/* The stored side of the seam, declared once for both consumers: the Fetch
 * application in `@project/http` and the PostgreSQL adapter under `src/`. */
export * from './repository';
export { canRetry, openSpaceSession } from './session';
export type { SaveBlock, SpaceSession, SpaceSessionOptions, SpaceSessionState } from './session';
export * from './session-registry';
export * from './working-space';
