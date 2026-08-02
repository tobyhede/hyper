export * from './backend';
/* The wire contract's two ends live in different processes. These are the
 * codecs the portable HTTP package and the legacy Node host share during the
 * migration. */
export {
  CANONICAL_DECIMAL,
  decodeCommitRequest,
  decodeCommittedRevision,
  decodeErrorMessage,
  decodeLoadedSpace,
  decodeSpaceSummaries,
  encodeCommitRequest,
  encodeLoadedSpace,
} from './http-protocol';
export type { LoadedSpaceJson } from './http-protocol';
export type { CommitRequestJson } from './http-protocol';
/* Two test-facing helpers, two doors, and the difference is what they are.
 * `MemorySpaceBackendTestControl` is named by `MemorySpaceBackend`'s public
 * constructor, so a caller that cannot import it cannot construct the adapter
 * this package ships — it is public surface. The shared backend *suite* imports
 * vitest and only a test runner can execute it, so it stays behind the
 * `./test-support` subpath instead. */
export { MemorySpaceBackend, MemorySpaceBackendTestControl } from './memory';
export * from './session';
