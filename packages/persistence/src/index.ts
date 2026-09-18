export * from './backend';
/* The rules a commit is judged by, decided once for every implementation
 * (ADR 0095). The rest of the module is private to it. */
export { commitRequestRefusal, committedRevision, decideCommit } from './commit-decision';
/* The wire contract's two ends live in different processes. These are the
 * codecs the portable HTTP package reads the wire through; the legacy Node host
 * that used to share them is gone. `CANONICAL_DECIMAL` belongs with them because
 * `HttpSpaceBackend` validates a revision header against it before decoding. */
export {
  CANONICAL_DECIMAL,
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
export { openSpaceSession } from './session';
export type { SpaceSession, SpaceSessionOptions, SpaceSessionState } from './session';
export * from './session-registry';
export * from './working-space';
