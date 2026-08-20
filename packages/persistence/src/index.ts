export * from './backend';
/* The wire contract's two ends live in different processes. These are the
 * codecs the portable HTTP package reads the wire through; the legacy Node host
 * that used to share them is gone. `CANONICAL_DECIMAL` belongs with them because
 * `HttpSpaceBackend` validates a revision header against it before decoding. */
export {
  CANONICAL_DECIMAL,
  decodeCommitRequest,
  decodeCommittedRevision,
  decodeProblemDetails,
  decodeLoadedSpace,
  decodeSpaceSummaries,
  encodeCommitRequest,
  encodeLoadedSpace,
  encodeProblemDetails,
  problemCodeForType,
  problemCatalogue,
} from './http-protocol';
export type {
  CommitRequestJson,
  DecodedCommitRequest,
  HyperProblemCode,
  HyperProblemStatus,
  HyperProblemType,
  LoadedSpaceJson,
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
/* The stored side of the seam, declared once for both consumers: the Fetch
 * application in `@project/http` and the PostgreSQL adapter under `src/`. */
export * from './repository';
export * from './session';
